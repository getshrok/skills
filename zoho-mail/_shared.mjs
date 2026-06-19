// _shared.mjs — Shared utilities for zoho-mail scripts.

export const EXIT = {
  OK:         0,
  USAGE:      1,
  AUTH:       2,
  CONNECTION: 3,
  NOT_FOUND:  4,
}

// Token cache — persisted to a temp file to avoid refreshing on every script invocation.
// Zoho access tokens are valid for ~1 hour. We refresh 5 minutes early to be safe.
import { readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createHash } from 'node:crypto'

const SKILL_DIR = import.meta.dirname
const CRED_STORE = process.env.ZOHO_CRED_STORE || join(SKILL_DIR, '.zoho-credentials.json')

// ── Credentials store ─────────────────────────────────────────────────────────
// Secrets (and non-secret account_id / from_address config) live here, keyed by
// short account alias, so the agent references an account by name (--account
// <alias>) instead of pasting long tokens. See .zoho-credentials.json for shape:
//   { "accounts": { "<alias>": { label, client_id, client_secret, refresh_token, account_id, from_address } }, "default": ... }

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

const SELECTED_ACCOUNT = (() => {
  const a = process.argv
  for (let i = 2; i < a.length; i++) {
    if ((a[i] === '--account' || a[i] === '-a') && a[i + 1] !== undefined) { const v = a[i + 1]; a.splice(i, 2); return v }
    if (a[i].startsWith('--account=')) { const v = a[i].slice('--account='.length); a.splice(i, 1); return v }
  }
  return process.env.ZOHO_ACCOUNT || null
})()

function resolveAccountSoft() {
  const store = loadCredStore()
  const aliases = Object.keys(store.accounts)
  const acct = SELECTED_ACCOUNT || store.default || (aliases.length === 1 ? aliases[0] : null)
  if (!acct || !store.accounts[acct]) return { acct: null, entry: {}, aliases }
  return { acct, entry: store.accounts[acct], aliases }
}

export function accountField(name, envVar) {
  const { entry } = resolveAccountSoft()
  return entry[name] ?? (envVar ? process.env[envVar] : null) ?? null
}

function requireCredentials() {
  const { ZOHO_CLIENT_ID, ZOHO_CLIENT_SECRET, ZOHO_REFRESH_TOKEN } = process.env
  if (ZOHO_CLIENT_ID && ZOHO_CLIENT_SECRET && ZOHO_REFRESH_TOKEN) {
    return { client_id: ZOHO_CLIENT_ID, client_secret: ZOHO_CLIENT_SECRET, refresh_token: ZOHO_REFRESH_TOKEN }
  }
  const { acct, entry, aliases } = resolveAccountSoft()
  if (!acct) {
    console.error(`No account selected. Pass --account <alias>. Available: ${aliases.join(', ') || '(none — add one with: node creds.mjs set <alias> ...)'}`)
    process.exit(EXIT.AUTH)
  }
  const missing = ['client_id', 'client_secret', 'refresh_token'].filter(k => !entry[k])
  if (missing.length) {
    console.error(`Account '${acct}' is missing: ${missing.join(', ')}. Set with: node creds.mjs set ${acct} --client-id ... --client-secret ... --refresh-token ...`)
    process.exit(EXIT.AUTH)
  }
  return { client_id: entry.client_id, client_secret: entry.client_secret, refresh_token: entry.refresh_token }
}

// ── Token cache (keyed by hash of client_id + refresh_token) ────────────────────
function tokenCachePath() {
  return join(tmpdir(), 'zoho-mail-token.json')
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

/**
 * Get a valid Zoho OAuth access token, refreshing only when expired.
 * Caches the token to disk so multiple script calls don't hammer the token endpoint.
 */
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

/**
 * Make an authenticated GET request to the Zoho Mail API.
 * Handles auth errors and connection errors with appropriate exit codes.
 */
export async function zohoGet(path, token) {
  const base = `https://mail.zoho.com/api/accounts/${requireAccountId()}`
  let res
  try {
    res = await fetch(`${base}${path}`, {
      headers: { Authorization: `Zoho-oauthtoken ${token}` },
    })
  } catch (err) {
    console.error(`Connection error: ${err.message}`)
    process.exit(EXIT.CONNECTION)
  }

  if (res.status === 401 || res.status === 403) {
    console.error(`Auth error (${res.status}) — check credentials`)
    process.exit(EXIT.AUTH)
  }

  if (!res.ok) {
    const text = await res.text()
    console.error(`API error (${res.status}): ${text}`)
    process.exit(EXIT.CONNECTION)
  }

  return res.json()
}

export function requireAccountId() {
  const id = accountField('account_id', 'ZOHO_ACCOUNT_ID')
  if (!id) { console.error('No account_id set. Add it with: node creds.mjs set <alias> --account-id <id> (or ZOHO_ACCOUNT_ID env)'); process.exit(EXIT.AUTH) }
  return id
}

// ── Credential management (CLI surface, used by creds.mjs) ─────────────────────
export function manageCreds(argv) {
  const sub = argv[0]
  const store = loadCredStore()
  const secretFields = ['client_id', 'client_secret', 'refresh_token']
  const plainFields = ['label', 'account_id', 'from_address']
  const view = (e) => ({
    label: e.label ?? null, account_id: e.account_id ?? null, from_address: e.from_address ?? null,
    client_id: fingerprint(e.client_id), client_secret: fingerprint(e.client_secret), refresh_token: fingerprint(e.refresh_token),
  })
  if (sub === 'list' || !sub) {
    const accounts = Object.entries(store.accounts).map(([alias, e]) => ({ account: alias, default: store.default === alias, ...view(e) }))
    console.log(JSON.stringify({ accounts, default: store.default }, null, 2)); return
  }
  if (sub === 'set') {
    const alias = argv[1]
    if (!alias) { console.error('Usage: creds.mjs set <alias> [--label L] [--client-id ID] [--client-secret S] [--refresh-token T] [--account-id ID] [--from-address ADDR] [--default] [--stdin]'); process.exit(EXIT.USAGE) }
    const entry = store.accounts[alias] ?? {}
    let useStdin = false, makeDefault = false
    const flag = { '--label': 'label', '--client-id': 'client_id', '--client-secret': 'client_secret', '--refresh-token': 'refresh_token', '--account-id': 'account_id', '--from-address': 'from_address' }
    for (let i = 2; i < argv.length; i++) {
      if (flag[argv[i]]) entry[flag[argv[i]]] = argv[++i]
      else if (argv[i] === '--stdin') useStdin = true
      else if (argv[i] === '--default') makeDefault = true
    }
    if (useStdin) {
      const blob = JSON.parse(readFileSync(0, 'utf8'))
      for (const k of [...secretFields, ...plainFields]) if (blob[k] != null) entry[k] = blob[k]
    }
    store.accounts[alias] = entry
    if (makeDefault || store.default == null) store.default = alias
    saveCredStore(store)
    console.log(JSON.stringify({ ok: true, account: alias, default: store.default, ...view(entry) }, null, 2))
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
    console.error(`Invalid date: "${value}". Use ISO 8601, "today/tomorrow/yesterday", "next <weekday>", "in N days/weeks", or "N days ago".`)
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
// Resolve the timezone Shrok operates in. Shrok stores a workspace-wide IANA
// `timezone` in config.json and requires all model-facing times to be
// workspace-local — so format in THAT zone, not the host's system tz (the box
// may be UTC while the user is in PT). Falls back to the host tz, then UTC.
let _wsTzCache
function workspaceTimeZone() {
  if (_wsTzCache) return _wsTzCache
  let tz
  try {
    const ws = process.env.SHROK_WORKSPACE_PATH || process.env.WORKSPACE_PATH
    if (ws) {
      const cfg = JSON.parse(readFileSync(join(ws, 'config.json'), 'utf8'))
      if (cfg && typeof cfg.timezone === 'string' && cfg.timezone.trim()) tz = cfg.timezone.trim()
    }
  } catch { /* no/unreadable config — fall back */ }
  _wsTzCache = tz || Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
  return _wsTzCache
}

export function toLocalISO(d) {
  if (!d || isNaN(d.getTime())) return null
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: workspaceTimeZone(),
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hour12: false,
  })
  const parts = Object.fromEntries(fmt.formatToParts(d).map(p => [p.type, p.value]))
  const hour = parts.hour === '24' ? '00' : parts.hour
  const utcMillis = Date.UTC(
    Number(parts.year), Number(parts.month) - 1, Number(parts.day),
    Number(hour), Number(parts.minute), Number(parts.second),
  )
  const offsetMin = Math.round((utcMillis - d.getTime()) / 60000)
  const pad = (n) => String(n).padStart(2, '0')
  const sign = offsetMin >= 0 ? '+' : '-'
  const absOff = Math.abs(offsetMin)
  return `${parts.year}-${parts.month}-${parts.day}T${hour}:${parts.minute}:${parts.second}` +
         `${sign}${pad(Math.floor(absOff / 60))}:${pad(absOff % 60)}`
}
