// _shared.mjs — Shared utilities for zoho-calendar scripts.

export const EXIT = {
  OK:         0,
  USAGE:      1,
  AUTH:       2,
  CONNECTION: 3,
  NOT_FOUND:  4,
  CONFLICT:   5,
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

// Short fingerprint of a secret so it can be verified without printing it.
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
  // Env-var override: one-off escape hatch. Normal path is the store via --account.
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

// ── Token cache ────────────────────────────────────────────────────────────────
// Keyed by a hash of the credential set (client_id + refresh_token), NOT by
// client_id alone — two accounts can share one client_id but have different
// refresh tokens (e.g. different scopes), and must not collide on cache.
function tokenCachePath() {
  return join(tmpdir(), 'zoho-calendar-token.json')
}

function cacheKey(clientId, refreshToken) {
  return createHash('sha256').update(`${clientId}:${refreshToken}`).digest('hex').slice(0, 16)
}

function readCachedToken(key) {
  try {
    const cache = JSON.parse(readFileSync(tokenCachePath(), 'utf8'))
    const e = cache[key]
    if (e && Date.now() < e.expiresAt - 5 * 60 * 1000) return e.token
  } catch { /* no cache */ }
  return null
}

function writeCachedToken(key, token, expiresIn) {
  try {
    let cache = {}
    try { cache = JSON.parse(readFileSync(tokenCachePath(), 'utf8')) } catch { /* fresh */ }
    cache[key] = { token, expiresAt: Date.now() + expiresIn * 1000 }
    writeFileSync(tokenCachePath(), JSON.stringify(cache))
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
    console.error(`Token refresh failed (${res.status}): ${await res.text()}`)
    process.exit(EXIT.AUTH)
  }

  const data = await res.json()
  if (!data.access_token) {
    console.error('Token refresh missing access_token:', JSON.stringify(data))
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

const BASE = 'https://calendar.zoho.com/api/v1'

export async function zohoGet(path, token) {
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
    console.error(`Auth error (${res.status})`)
    process.exit(EXIT.AUTH)
  }
  if (!res.ok) {
    console.error(`API error (${res.status}): ${await res.text()}`)
    process.exit(EXIT.CONNECTION)
  }
  return res.json()
}

export async function zohoPost(path, token, body) {
  // Zoho Calendar API expects form-encoded params with JSON values, not a JSON body
  const params = new URLSearchParams()
  for (const [k, v] of Object.entries(body)) {
    params.set(k, typeof v === 'string' ? v : JSON.stringify(v))
  }
  let res
  try {
    res = await fetch(`${BASE}${path}`, {
      method: 'POST',
      headers: {
        Authorization: `Zoho-oauthtoken ${token}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: params,
    })
  } catch (err) {
    console.error(`Connection error: ${err.message}`)
    process.exit(EXIT.CONNECTION)
  }
  if (res.status === 401 || res.status === 403) {
    console.error(`Auth error (${res.status})`)
    process.exit(EXIT.AUTH)
  }
  if (!res.ok) {
    console.error(`API error (${res.status}): ${await res.text()}`)
    process.exit(EXIT.CONNECTION)
  }
  return res.json()
}

export async function zohoPut(path, token, body, etag) {
  const params = new URLSearchParams()
  for (const [k, v] of Object.entries(body)) {
    params.set(k, typeof v === 'string' ? v : JSON.stringify(v))
  }
  const headers = {
    Authorization: `Zoho-oauthtoken ${token}`,
    'Content-Type': 'application/x-www-form-urlencoded',
  }
  if (etag) headers['etag'] = etag

  let res
  try {
    res = await fetch(`${BASE}${path}`, { method: 'PUT', headers, body: params })
  } catch (err) {
    console.error(`Connection error: ${err.message}`)
    process.exit(EXIT.CONNECTION)
  }
  if (res.status === 412) {
    console.error('Etag conflict — event was modified externally')
    process.exit(EXIT.CONFLICT)
  }
  if (res.status === 401 || res.status === 403) {
    console.error(`Auth error (${res.status})`)
    process.exit(EXIT.AUTH)
  }
  if (!res.ok) {
    console.error(`API error (${res.status}): ${await res.text()}`)
    process.exit(EXIT.CONNECTION)
  }
  return res.json()
}

export async function zohoDelete(path, token, etag) {
  const headers = { Authorization: `Zoho-oauthtoken ${token}` }
  if (etag) headers['etag'] = etag

  let res
  try {
    res = await fetch(`${BASE}${path}`, { method: 'DELETE', headers })
  } catch (err) {
    console.error(`Connection error: ${err.message}`)
    process.exit(EXIT.CONNECTION)
  }
  if (res.status === 412) {
    console.error('Etag conflict — event was modified externally')
    process.exit(EXIT.CONFLICT)
  }
  if (res.status === 401 || res.status === 403) {
    console.error(`Auth error (${res.status})`)
    process.exit(EXIT.AUTH)
  }
  if (res.status === 404) {
    console.error('Event not found')
    process.exit(EXIT.NOT_FOUND)
  }
  if (!res.ok) {
    console.error(`API error (${res.status}): ${await res.text()}`)
    process.exit(EXIT.CONNECTION)
  }
  return res.json()
}

// ─── Date helpers ────────────────────────────────────────────────────────────

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

  const ahead = s.match(/^in\s+(\d+)\s+(day|week|month)s?$/i)
  if (ahead) {
    const n = parseInt(ahead[1], 10)
    const d = new Date()
    if (ahead[2].toLowerCase() === 'day')   d.setDate(d.getDate() + n)
    if (ahead[2].toLowerCase() === 'week')  d.setDate(d.getDate() + n * 7)
    if (ahead[2].toLowerCase() === 'month') d.setMonth(d.getMonth() + n)
    return d
  }

  const d = new Date(s)
  if (isNaN(d.getTime())) {
    console.error(`Invalid date: "${value}"`)
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

// Convert an ISO-like string (with or without offset, or `Z`) to local ISO.
// All-day "YYYY-MM-DD" passes through unchanged.
function toLocalISOFromString(s) {
  if (!s) return null
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s
  return toLocalISO(new Date(s))
}

/** Format a Date as Zoho's yyyyMMdd string */
export function toZohoDate(d) {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}${m}${day}`
}

/** Format a Date as Zoho's yyyyMMddTHHmmssZ string (UTC) */
export function toZohoDateTime(d) {
  return d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')
}

/** Parse Zoho's dateandtime object into ISO strings */
export function parseZohoDatetime(dt) {
  if (!dt) return { start: null, end: null, timezone: null, allDay: false }
  const tz = dt.timezone ?? null
  const allDay = !dt.start?.includes('T')
  const start = parseSingleZohoDate(dt.start)
  const end = parseSingleZohoDate(dt.end)
  return { start, end, timezone: tz, allDay }
}

function parseSingleZohoDate(s) {
  if (!s) return null
  // All-day: 20260401
  if (/^\d{8}$/.test(s)) return `${s.slice(0,4)}-${s.slice(4,6)}-${s.slice(6,8)}`
  // With offset: 20260407T070000-0400
  const m = s.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})([+-]\d{4})?Z?$/)
  if (m) {
    const iso = `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}`
    if (m[7]) return `${iso}${m[7].slice(0,3)}:${m[7].slice(3)}`
    return `${iso}Z`
  }
  return s
}

/** Normalize a Zoho event response into a clean object.
 *  start/end/createdAt/updatedAt are emitted as local-tz ISO (or YYYY-MM-DD
 *  for all-day events). The `timezone` field preserves the original event tz. */
export function normalizeEvent(e) {
  const dt = parseZohoDatetime(e.dateandtime)
  return {
    uid: e.uid,
    title: e.title ?? '',
    start: toLocalISOFromString(dt.start),
    end: toLocalISOFromString(dt.end),
    allDay: dt.allDay,
    timezone: dt.timezone,
    location: e.location ?? '',
    description: e.description ?? '',
    attendees: (e.attendees ?? []).map(a => a.email).filter(Boolean),
    organizer: e.organizer ?? '',
    isRecurring: !!e.rrule || !!e.recurrenceid,
    etag: e.etag ?? null,
    calendarUid: e.caluid ?? '',
    createdAt: toLocalISOFromString(parseSingleZohoDate(e.createdtime)) ?? '',
    updatedAt: toLocalISOFromString(parseSingleZohoDate(e.lastmodifiedtime)) ?? '',
  }
}
