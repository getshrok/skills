// _shared.mjs — Shared utilities for zoho-cliq scripts.

export const EXIT = {
  OK:         0,
  USAGE:      1,
  AUTH:       2,
  CONNECTION: 3,
  NOT_FOUND:  4,
}

import { readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createHash } from 'node:crypto'

const SKILL_DIR = import.meta.dirname
const CRED_STORE = process.env.ZOHO_CRED_STORE || join(SKILL_DIR, '.zoho-credentials.json')

// ── Credentials store ─────────────────────────────────────────────────────────
// Secrets live here, keyed by short account alias, so the agent references an
// account by name (--account <alias>) instead of pasting long tokens it might
// mis-copy. Shape (see the committed .zoho-credentials.json for the example):
//   { "accounts": { "<alias>": { label, client_id, client_secret, refresh_token } }, "default": "<alias>|null" }

export function loadCredStore() {
  try {
    const s = JSON.parse(readFileSync(CRED_STORE, 'utf8'))
    if (!s.accounts) s.accounts = {}
    if (!('default' in s)) s.default = null
    return s
  } catch {
    return { accounts: {}, default: null }
  }
}

export function saveCredStore(store) {
  writeFileSync(CRED_STORE, JSON.stringify(store, null, 2) + '\n')
}

export function fingerprint(s) {
  if (!s) return null
  return s.length <= 8 ? '••••' : `…${s.slice(-4)} (len ${s.length})`
}

// Extract --account/-a from argv at load time (before entry scripts parse their
// args with strict parsers), storing the value and removing it from argv so the
// entry script's own parser never sees it.
const SELECTED_ACCOUNT = (() => {
  const a = process.argv
  for (let i = 2; i < a.length; i++) {
    if ((a[i] === '--account' || a[i] === '-a') && a[i + 1] !== undefined) { const v = a[i + 1]; a.splice(i, 2); return v }
    if (a[i].startsWith('--account=')) { const v = a[i].slice('--account='.length); a.splice(i, 1); return v }
  }
  return process.env.ZOHO_ACCOUNT || null
})()

function resolveAccount() {
  const store = loadCredStore()
  const aliases = Object.keys(store.accounts)
  const acct = SELECTED_ACCOUNT || store.default || (aliases.length === 1 ? aliases[0] : null)
  if (!acct) {
    console.error(`No account selected. Pass --account <alias>. Available: ${aliases.join(', ') || '(none — add one with: node creds.mjs set <alias> ...)'}`)
    process.exit(EXIT.AUTH)
  }
  const entry = store.accounts[acct]
  if (!entry) {
    console.error(`Unknown account '${acct}'. Available: ${aliases.join(', ') || '(none)'}`)
    process.exit(EXIT.AUTH)
  }
  return { acct, entry }
}

function requireCredentials() {
  const { ZOHO_CLIENT_ID, ZOHO_CLIENT_SECRET, ZOHO_REFRESH_TOKEN } = process.env
  if (ZOHO_CLIENT_ID && ZOHO_CLIENT_SECRET && ZOHO_REFRESH_TOKEN) {
    return { client_id: ZOHO_CLIENT_ID, client_secret: ZOHO_CLIENT_SECRET, refresh_token: ZOHO_REFRESH_TOKEN }
  }
  const { acct, entry } = resolveAccount()
  const missing = ['client_id', 'client_secret', 'refresh_token'].filter(k => !entry[k])
  if (missing.length) {
    console.error(`Account '${acct}' is missing: ${missing.join(', ')}. Set with: node creds.mjs set ${acct} --client-id ... --client-secret ... --refresh-token ...`)
    process.exit(EXIT.AUTH)
  }
  return { client_id: entry.client_id, client_secret: entry.client_secret, refresh_token: entry.refresh_token }
}

// ── Token cache (keyed by a hash of client_id + refresh_token, so accounts that
// share one client_id but use different-scoped refresh tokens don't collide) ────
const CACHE_PATH = join(tmpdir(), 'zoho-cliq-token.json')

function cacheKey(clientId, refreshToken) {
  return createHash('sha256').update(`${clientId}:${refreshToken}`).digest('hex').slice(0, 16)
}

function readCachedToken(key) {
  try {
    const cache = JSON.parse(readFileSync(CACHE_PATH, 'utf8'))
    const e = cache[key]
    if (e && Date.now() < e.expiresAt - 5 * 60 * 1000) return e.token
  } catch { /* no cache */ }
  return null
}

function writeCachedToken(key, token, expiresIn) {
  try {
    let cache = {}
    try { cache = JSON.parse(readFileSync(CACHE_PATH, 'utf8')) } catch { /* fresh */ }
    cache[key] = { token, expiresAt: Date.now() + expiresIn * 1000 }
    writeFileSync(CACHE_PATH, JSON.stringify(cache))
  } catch { /* best effort */ }
}

export async function getAccessToken() {
  const { client_id, client_secret, refresh_token } = requireCredentials()
  const key = cacheKey(client_id, refresh_token)
  const cached = readCachedToken(key)
  if (cached) return cached

  const res = await fetch('https://accounts.zoho.com/oauth/v2/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type:    'refresh_token',
      client_id,
      client_secret,
      refresh_token,
    }),
  })

  if (!res.ok) {
    const text = await res.text()
    console.error(`Token refresh failed (${res.status}): ${text}`)
    process.exit(EXIT.AUTH)
  }

  const data = await res.json()
  if (!data.access_token) {
    console.error('Token refresh response missing access_token:', JSON.stringify(data))
    process.exit(EXIT.AUTH)
  }

  writeCachedToken(key, data.access_token, data.expires_in ?? 3600)
  return data.access_token
}

// ── Credential management (CLI surface, used by creds.mjs) ─────────────────────
export function manageCreds(argv) {
  const sub = argv[0]
  const store = loadCredStore()
  const fields = ['label', 'client_id', 'client_secret', 'refresh_token']
  if (sub === 'list' || !sub) {
    const accounts = Object.entries(store.accounts).map(([alias, e]) => ({
      account: alias, default: store.default === alias, label: e.label ?? null,
      client_id: fingerprint(e.client_id), client_secret: fingerprint(e.client_secret), refresh_token: fingerprint(e.refresh_token),
    }))
    console.log(JSON.stringify({ accounts, default: store.default }, null, 2)); return
  }
  if (sub === 'set') {
    const alias = argv[1]
    if (!alias) { console.error('Usage: creds.mjs set <alias> [--label L] [--client-id ID] [--client-secret S] [--refresh-token T] [--default] [--stdin]'); process.exit(EXIT.USAGE) }
    const entry = store.accounts[alias] ?? {}
    let useStdin = false, makeDefault = false
    for (let i = 2; i < argv.length; i++) {
      if (argv[i] === '--label') entry.label = argv[++i]
      else if (argv[i] === '--client-id') entry.client_id = argv[++i]
      else if (argv[i] === '--client-secret') entry.client_secret = argv[++i]
      else if (argv[i] === '--refresh-token') entry.refresh_token = argv[++i]
      else if (argv[i] === '--stdin') useStdin = true
      else if (argv[i] === '--default') makeDefault = true
    }
    if (useStdin) {
      const blob = JSON.parse(readFileSync(0, 'utf8'))
      for (const k of fields) if (blob[k] != null) entry[k] = blob[k]
    }
    store.accounts[alias] = entry
    if (makeDefault || store.default == null) store.default = alias
    saveCredStore(store)
    console.log(JSON.stringify({ ok: true, account: alias, default: store.default, label: entry.label ?? null,
      client_id: fingerprint(entry.client_id), client_secret: fingerprint(entry.client_secret), refresh_token: fingerprint(entry.refresh_token) }, null, 2))
    return
  }
  if (sub === 'set-default') {
    const alias = argv[1]
    if (!alias || !store.accounts[alias]) { console.error(`Unknown account '${alias}'. Available: ${Object.keys(store.accounts).join(', ') || '(none)'}`); process.exit(EXIT.USAGE) }
    store.default = alias; saveCredStore(store); console.log(JSON.stringify({ ok: true, default: alias })); return
  }
  if (sub === 'remove' || sub === 'rm') {
    const alias = argv[1]
    if (!alias || !store.accounts[alias]) { console.error(`Unknown account '${alias}'. Available: ${Object.keys(store.accounts).join(', ') || '(none)'}`); process.exit(EXIT.USAGE) }
    delete store.accounts[alias]
    if (store.default === alias) store.default = Object.keys(store.accounts)[0] ?? null
    saveCredStore(store); console.log(JSON.stringify({ ok: true, removed: alias, default: store.default })); return
  }
  console.error(`Unknown creds subcommand '${sub}'. Use: list | set | set-default | remove`); process.exit(EXIT.USAGE)
}

const DAY_NAMES = ['sunday','monday','tuesday','wednesday','thursday','friday','saturday']

export function parseDateArg(value) {
  const s = value.trim()
  const lower = s.toLowerCase()

  if (lower === 'today')     return startOfDay(new Date())
  if (lower === 'tomorrow')  { const d = startOfDay(new Date()); d.setDate(d.getDate() + 1); return d }
  if (lower === 'yesterday') { const d = startOfDay(new Date()); d.setDate(d.getDate() - 1); return d }

  const nextDay = lower.match(/^next\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday)$/)
  if (nextDay) {
    const target = DAY_NAMES.indexOf(nextDay[1])
    const d = new Date()
    const diff = ((target - d.getDay() + 7) % 7) || 7
    d.setDate(d.getDate() + diff)
    return startOfDay(d)
  }

  const ago = s.match(/^(\d+)\s+(day|week|month)s?\s+ago$/i)
  if (ago) {
    const n = parseInt(ago[1], 10)
    const d = new Date()
    if (ago[2].toLowerCase() === 'day')   d.setDate(d.getDate() - n)
    if (ago[2].toLowerCase() === 'week')  d.setDate(d.getDate() - n * 7)
    if (ago[2].toLowerCase() === 'month') d.setMonth(d.getMonth() - n)
    return d
  }

  const d = new Date(s)
  if (isNaN(d.getTime())) {
    console.error(`Invalid date: "${value}". Use ISO 8601, "today/yesterday", "next <weekday>", or "N days/weeks/months ago".`)
    process.exit(EXIT.USAGE)
  }
  return d
}

function startOfDay(d) {
  d.setHours(0, 0, 0, 0)
  return d
}

// Format a Date as ISO 8601 with the system's local timezone offset
// (e.g. "2026-05-21T10:30:00-04:00"). Returns null for invalid dates.
export function toLocalISO(d) {
  if (!d || isNaN(d.getTime())) return null
  const pad = (n, w = 2) => String(n).padStart(w, '0')
  const tz = -d.getTimezoneOffset()
  const sign = tz >= 0 ? '+' : '-'
  const absTz = Math.abs(tz)
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T` +
         `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}` +
         `${sign}${pad(Math.floor(absTz / 60))}:${pad(absTz % 60)}`
}

const BASE = 'https://cliq.zoho.com/api/v2'

export async function cliqGet(path, token) {
  let res
  try {
    res = await fetch(`${BASE}${path}`, {
      headers: { Authorization: `Zoho-oauthtoken ${token}` },
    })
  } catch (err) {
    console.error(`Connection error: ${err.message}`)
    process.exit(EXIT.CONNECTION)
  }
  if (res.status === 401 || res.status === 403) {
    console.error(`Auth error (${res.status}) — check credentials and scopes`)
    process.exit(EXIT.AUTH)
  }
  if (res.status === 404) {
    console.error('Not found')
    process.exit(EXIT.NOT_FOUND)
  }
  if (!res.ok) {
    const text = await res.text()
    console.error(`API error (${res.status}): ${text}`)
    process.exit(EXIT.CONNECTION)
  }
  return res.json()
}

export async function cliqPost(path, token, body) {
  let res
  try {
    res = await fetch(`${BASE}${path}`, {
      method: 'POST',
      headers: {
        Authorization: `Zoho-oauthtoken ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    })
  } catch (err) {
    console.error(`Connection error: ${err.message}`)
    process.exit(EXIT.CONNECTION)
  }
  if (res.status === 401 || res.status === 403) {
    console.error(`Auth error (${res.status}) — check credentials and scopes`)
    process.exit(EXIT.AUTH)
  }
  if (!res.ok) {
    const text = await res.text()
    console.error(`API error (${res.status}): ${text}`)
    process.exit(EXIT.CONNECTION)
  }
  if (res.status === 204) return {}
  const text = await res.text()
  return text ? JSON.parse(text) : {}
}
