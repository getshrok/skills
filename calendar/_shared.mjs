// _shared.mjs — Shared utilities for calendar scripts.

import { createDAVClient } from 'tsdav'
import { randomUUID } from 'node:crypto'
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

export const EXIT = {
  OK:         0,
  USAGE:      1,
  AUTH:       2,
  CONNECTION: 3,
  NOT_FOUND:  4,
  CONFLICT:   5,
}

const SKILL_DIR = import.meta.dirname
const CRED_STORE = process.env.CALDAV_CRED_STORE || join(SKILL_DIR, '.calendar-credentials.json')

// ── Credentials store ─────────────────────────────────────────────────────────
// Per-account CalDAV config + secrets, keyed by short alias, so the agent picks
// an account by name (--account <alias>) instead of pasting passwords/tokens.
// See .calendar-credentials.json for the example shape. An account is either:
//   basic: { label, url, auth_method:"basic", user, pass }
//   oauth: { label, url, auth_method:"oauth", token_url, client_id, client_secret, refresh_token }
export function loadCredStore() {
  try {
    const s = JSON.parse(readFileSync(CRED_STORE, 'utf8'))
    if (!s.accounts) s.accounts = {}
    if (!('default' in s)) s.default = null
    return s
  } catch { return { accounts: {}, default: null } }
}
export function saveCredStore(store) { writeFileSync(CRED_STORE, JSON.stringify(store, null, 2) + '\n') }
export function fingerprint(s) { if (!s) return null; return s.length <= 8 ? '••••' : `…${s.slice(-4)} (len ${s.length})` }

// Extract --account/-a from argv at load (before strict entry-script parsers run).
const SELECTED_ACCOUNT = (() => {
  const a = process.argv
  for (let i = 2; i < a.length; i++) {
    if ((a[i] === '--account' || a[i] === '-a') && a[i + 1] !== undefined) { const v = a[i + 1]; a.splice(i, 2); return v }
    if (a[i].startsWith('--account=')) { const v = a[i].slice('--account='.length); a.splice(i, 1); return v }
  }
  return process.env.CALDAV_ACCOUNT || null
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

// ─── Client ───────────────────────────────────────────────────────────────────

export async function makeClient() {
  const url = accountField('url', 'CALDAV_URL')
  if (!url) { console.error('No CalDAV url. Set with: node creds.mjs set <alias> --url ... (or CALDAV_URL env)'); process.exit(EXIT.CONNECTION) }

  const method = (accountField('auth_method', 'CALDAV_AUTH_METHOD') ?? 'basic').toLowerCase()

  if (method === 'oauth') {
    const tokenUrl = accountField('token_url', 'CALDAV_TOKEN_URL')
    const clientId = accountField('client_id', 'CALDAV_CLIENT_ID')
    const clientSecret = accountField('client_secret', 'CALDAV_CLIENT_SECRET')
    const refreshToken = accountField('refresh_token', 'CALDAV_REFRESH_TOKEN')
    if (!tokenUrl)     { console.error('No token_url (oauth). Set with: node creds.mjs set <alias> --token-url ...'); process.exit(EXIT.AUTH) }
    if (!clientId)     { console.error('No client_id (oauth). Set with: node creds.mjs set <alias> --client-id ...'); process.exit(EXIT.AUTH) }
    if (!clientSecret) { console.error('No client_secret (oauth). Set with: node creds.mjs set <alias> --client-secret ...'); process.exit(EXIT.AUTH) }
    if (!refreshToken) { console.error('No refresh_token (oauth). Set with: node creds.mjs set <alias> --refresh-token ...'); process.exit(EXIT.AUTH) }
    return createDAVClient({
      serverUrl: url,
      credentials: { tokenUrl, clientId, clientSecret, refreshToken },
      authMethod: 'Oauth',
      defaultAccountType: 'caldav',
    })
  }

  // Basic auth (default)
  const user = accountField('user', 'CALDAV_USER')
  const pass = accountField('pass', 'CALDAV_PASS')
  if (!user) { console.error('No user (basic). Set with: node creds.mjs set <alias> --user ... (or CALDAV_USER env)'); process.exit(EXIT.AUTH) }
  if (!pass) { console.error('No pass (basic). Set with: node creds.mjs set <alias> --pass ... (or CALDAV_PASS env)'); process.exit(EXIT.AUTH) }
  return createDAVClient({
    serverUrl: url,
    credentials: { username: user, password: pass },
    authMethod: 'Basic',
    defaultAccountType: 'caldav',
  })
}

// ── Credential management (CLI surface, used by creds.mjs) ─────────────────────
export function manageCreds(argv) {
  const sub = argv[0]
  const store = loadCredStore()
  const secretFields = ['pass', 'client_secret', 'refresh_token']
  const plainFields = ['label', 'url', 'auth_method', 'user', 'token_url', 'client_id']
  const view = (e) => {
    const o = {}
    for (const k of plainFields) o[k] = e[k] ?? null
    for (const k of secretFields) o[k] = fingerprint(e[k])
    return o
  }
  if (sub === 'list' || !sub) {
    const accounts = Object.entries(store.accounts).map(([alias, e]) => ({ account: alias, default: store.default === alias, ...view(e) }))
    console.log(JSON.stringify({ accounts, default: store.default }, null, 2)); return
  }
  if (sub === 'set') {
    const alias = argv[1]
    if (!alias) { console.error('Usage: creds.mjs set <alias> --url U [--auth-method basic|oauth] [--user U] [--pass P] [--token-url U] [--client-id ID] [--client-secret S] [--refresh-token T] [--label L] [--default] [--stdin]'); process.exit(EXIT.USAGE) }
    const entry = store.accounts[alias] ?? {}
    let useStdin = false, makeDefault = false
    const flag = { '--label': 'label', '--url': 'url', '--auth-method': 'auth_method', '--user': 'user', '--pass': 'pass', '--token-url': 'token_url', '--client-id': 'client_id', '--client-secret': 'client_secret', '--refresh-token': 'refresh_token' }
    for (let i = 2; i < argv.length; i++) {
      if (flag[argv[i]]) entry[flag[argv[i]]] = argv[++i]
      else if (argv[i] === '--stdin') useStdin = true
      else if (argv[i] === '--default') makeDefault = true
    }
    if (useStdin) { const blob = JSON.parse(readFileSync(0, 'utf8')); for (const k of [...secretFields, ...plainFields]) if (blob[k] != null) entry[k] = blob[k] }
    store.accounts[alias] = entry
    if (makeDefault || store.default == null) store.default = alias
    saveCredStore(store)
    console.log(JSON.stringify({ ok: true, account: alias, default: store.default, ...view(entry) }, null, 2)); return
  }
  if (sub === 'set-default') {
    const alias = argv[1]
    if (!alias || !store.accounts[alias]) { console.error(`Unknown account '${alias}'. Available: ${Object.keys(store.accounts).join(', ') || '(none)'}`); process.exit(EXIT.USAGE) }
    store.default = alias; saveCredStore(store); console.log(JSON.stringify({ ok: true, default: alias })); return
  }
  if (sub === 'remove' || sub === 'rm') {
    const alias = argv[1]
    if (!alias || !store.accounts[alias]) { console.error(`Unknown account '${alias}'. Available: ${Object.keys(store.accounts).join(', ') || '(none)'}`); process.exit(EXIT.USAGE) }
    delete store.accounts[alias]; if (store.default === alias) store.default = Object.keys(store.accounts)[0] ?? null
    saveCredStore(store); console.log(JSON.stringify({ ok: true, removed: alias, default: store.default })); return
  }
  console.error(`Unknown creds subcommand '${sub}'. Use: list | set | set-default | remove`); process.exit(EXIT.USAGE)
}

// ─── Calendar resolution ──────────────────────────────────────────────────────

export function findCalendar(calendars, nameOrIndex) {
  if (!nameOrIndex) {
    return calendars.find(c => !c.readOnly) ?? calendars[0] ?? null
  }
  const idx = parseInt(nameOrIndex, 10)
  if (!isNaN(idx) && idx >= 0 && idx < calendars.length) return calendars[idx]
  const lower = nameOrIndex.toLowerCase()
  return calendars.find(c => (c.displayName ?? '').toLowerCase().includes(lower)) ?? null
}

// ─── Date parsing ─────────────────────────────────────────────────────────────

const DAY_NAMES = ['sunday','monday','tuesday','wednesday','thursday','friday','saturday']

export function parseDateArg(value, exitOnError = true) {
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
  if (!isNaN(d.getTime())) return d

  console.error(`Invalid date: "${value}". Use ISO 8601, "today/tomorrow/yesterday", "next <weekday>", "in N days/weeks", or "N days ago".`)
  if (exitOnError) process.exit(EXIT.USAGE)
  return null
}

function startOfDay(d) {
  d.setHours(0, 0, 0, 0)
  return d
}

// ─── iCal parsing ─────────────────────────────────────────────────────────────

function unfold(ical) {
  return ical.replace(/\r\n[ \t]/g, '').replace(/\n[ \t]/g, '')
}

export function parseVEvents(icalStr) {
  const lines = unfold(icalStr).split(/\r?\n/)
  const events = []
  let current = null

  for (const line of lines) {
    if (line === 'BEGIN:VEVENT') { current = {}; continue }
    if (line === 'END:VEVENT')   { if (current) events.push(current); current = null; continue }
    if (!current) continue

    const colon = line.indexOf(':')
    if (colon < 0) continue

    const nameAndParams = line.slice(0, colon)
    const value = line.slice(colon + 1)
    const parts = nameAndParams.split(';')
    const name = parts[0].toUpperCase()
    const params = {}
    for (let i = 1; i < parts.length; i++) {
      const eq = parts[i].indexOf('=')
      if (eq >= 0) params[parts[i].slice(0, eq).toUpperCase()] = parts[i].slice(eq + 1)
    }

    if (name === 'ATTENDEE') {
      if (!current[name]) current[name] = []
      current[name].push({ value, params })
    } else {
      current[name] = { value, params }
    }
  }

  return events
}

export function normalizeEvent(props, uid) {
  const summary     = props['SUMMARY']?.value ?? ''
  const location    = props['LOCATION']?.value ?? ''
  const description = props['DESCRIPTION']?.value?.replace(/\\n/g, '\n').replace(/\\,/g, ',') ?? ''
  const status      = props['STATUS']?.value ?? 'CONFIRMED'
  const rrule       = props['RRULE']?.value ?? null

  const rawStart = props['DTSTART']
  const rawEnd   = props['DTEND']
  const allDay   = rawStart?.params?.VALUE === 'DATE' || (rawStart?.value && /^\d{8}$/.test(rawStart.value))

  const start = rawStart ? formatICalDate(rawStart.value, rawStart.params?.TZID) : null
  const end   = rawEnd   ? formatICalDate(rawEnd.value,   rawEnd.params?.TZID)   : null

  const attendees = (props['ATTENDEE'] ?? [])
    .map(a => a.value.replace(/^mailto:/i, ''))
    .filter(Boolean)

  const event = { uid, summary, start, end, allDay, location, description, attendees, status }
  if (rrule) event.rrule = rrule
  return event
}

export function normalizeEventDetail(props, uid) {
  const base = normalizeEvent(props, uid)
  const created      = props['CREATED']?.value      ? formatICalDate(props['CREATED'].value)       : null
  const lastModified = props['LAST-MODIFIED']?.value ? formatICalDate(props['LAST-MODIFIED'].value) : null
  if (created)      base.created = created
  if (lastModified) base.lastModified = lastModified
  return base
}

// Format a Date as ISO 8601 with the system's local timezone offset.
// (Exported as toLocalISO at the bottom of this module for use by callers.)
function toLocalISO(d) {
  if (!d || isNaN(d.getTime())) return null
  const pad = (n, w = 2) => String(n).padStart(w, '0')
  const tz = -d.getTimezoneOffset()
  const sign = tz >= 0 ? '+' : '-'
  const absTz = Math.abs(tz)
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T` +
         `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}` +
         `${sign}${pad(Math.floor(absTz / 60))}:${pad(absTz % 60)}`
}

// Resolve a wall-clock time in an arbitrary IANA timezone to its UTC instant.
// Two-pass refinement handles DST transitions correctly via Intl.
function utcFromTzWallClock(year, mon, day, hh, mm, ss, tzid) {
  let utc = Date.UTC(year, mon - 1, day, hh, mm, ss)
  for (let i = 0; i < 2; i++) {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: tzid, hour12: false,
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
    }).formatToParts(new Date(utc))
    const p = {}
    for (const x of parts) p[x.type] = x.value
    const got = Date.UTC(+p.year, +p.month - 1, +p.day,
                        p.hour === '24' ? 0 : +p.hour, +p.minute, +p.second)
    const drift = Date.UTC(year, mon - 1, day, hh, mm, ss) - got
    if (drift === 0) break
    utc += drift
  }
  return utc
}

function formatICalDate(value, tzid) {
  if (!value) return null
  // All-day: YYYYMMDD → YYYY-MM-DD
  if (/^\d{8}$/.test(value)) {
    return `${value.slice(0,4)}-${value.slice(4,6)}-${value.slice(6,8)}`
  }
  // UTC: 20260407T110000Z → local ISO
  if (value.endsWith('Z')) {
    const iso = value.replace(/(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z/,
                              '$1-$2-$3T$4:$5:$6Z')
    return toLocalISO(new Date(iso))
  }
  // Floating: 20260407T070000 (interpret as in tzid if given, else system local)
  const m = value.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})$/)
  if (!m) return value
  if (tzid) {
    const utc = utcFromTzWallClock(+m[1], +m[2], +m[3], +m[4], +m[5], +m[6], tzid)
    return toLocalISO(new Date(utc))
  }
  // No tzid: the wall clock is already in the system's local time
  return toLocalISO(new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]))
}

export { toLocalISO }

// ─── iCal generation ──────────────────────────────────────────────────────────

export function generateUID() {
  return randomUUID()
}

export function icalDateProp(propName, value, allDay, timezone) {
  const d = value instanceof Date ? value : new Date(value)

  if (allDay) {
    const y = d.getFullYear()
    const m = String(d.getMonth() + 1).padStart(2, '0')
    const day = String(d.getDate()).padStart(2, '0')
    return `${propName};VALUE=DATE:${y}${m}${day}`
  }

  if (timezone) {
    const pad = n => String(n).padStart(2, '0')
    const local = new Date(d.toLocaleString('en-US', { timeZone: timezone }))
    const str = `${local.getFullYear()}${pad(local.getMonth()+1)}${pad(local.getDate())}T${pad(local.getHours())}${pad(local.getMinutes())}${pad(local.getSeconds())}`
    return `${propName};TZID=${timezone}:${str}`
  }

  const utc = d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')
  return `${propName}:${utc}`
}

export function buildVCalendar(veventLines) {
  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//saturday//calendar//EN',
    'BEGIN:VEVENT',
    ...veventLines,
    'END:VEVENT',
    'END:VCALENDAR',
  ].join('\r\n') + '\r\n'
}

export function icalEscape(str) {
  return str.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n')
}

// ─── Raw-line helpers for lossless update ─────────────────────────────────────

/** Returns raw property lines from the first VEVENT in an iCal string. */
export function getRawVEventLines(icalStr) {
  const lines = unfold(icalStr).split(/\r?\n/)
  const start = lines.findIndex(l => l === 'BEGIN:VEVENT')
  const end   = lines.findIndex(l => l === 'END:VEVENT')
  if (start < 0 || end < 0) return []
  return lines.slice(start + 1, end).filter(Boolean)
}

/** Replaces the first line for the given property name, or appends if absent. Mutates in place. */
export function replaceOrAddProp(lines, propName, newLine) {
  const upper = propName.toUpperCase()
  const idx = lines.findIndex(l => l.split(':')[0].split(';')[0].toUpperCase() === upper)
  if (idx >= 0) lines.splice(idx, 1, newLine)
  else lines.push(newLine)
}

/** Removes all lines for the given property name. Mutates in place. */
export function removeProp(lines, propName) {
  const upper = propName.toUpperCase()
  for (let i = lines.length - 1; i >= 0; i--) {
    if (lines[i].split(':')[0].split(';')[0].toUpperCase() === upper) lines.splice(i, 1)
  }
}

export function parseAlarms(icalStr) {
  const lines = unfold(icalStr).split(/\r?\n/)
  const alarms = []
  let current = null

  for (const line of lines) {
    if (line === 'BEGIN:VALARM') { current = {}; continue }
    if (line === 'END:VALARM')   { if (current) alarms.push(current); current = null; continue }
    if (!current) continue
    const colon = line.indexOf(':')
    if (colon < 0) continue
    current[line.slice(0, colon).toUpperCase()] = line.slice(colon + 1)
  }

  return alarms.map(a => ({ action: a['ACTION'] ?? '', trigger: a['TRIGGER'] ?? '' }))
}
