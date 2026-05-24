#!/usr/bin/env node

import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { createHash } from 'node:crypto'

const SKILL_DIR = import.meta.dirname
const TOKEN_CACHE = join(SKILL_DIR, '.token-cache')
const CRED_STORE = process.env.GCAL_CRED_STORE || join(SKILL_DIR, '.google-calendar-credentials.json')
const CALENDAR_API = 'https://www.googleapis.com/calendar/v3'
const TOKEN_URL = 'https://oauth2.googleapis.com/token'
const AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth'
const SCOPES = 'https://www.googleapis.com/auth/calendar'
const REDIRECT_URI = 'http://localhost'

// Selected account alias (from --account / -a). The model passes only the alias.
let ACCOUNT = null

// ── Credentials store ─────────────────────────────────────────────────────────
// Secrets live here, keyed by short account alias. See the committed
// .google-calendar-credentials.json for the example shape:
//   { "accounts": { "<alias>": { email, client_id, client_secret, refresh_token } }, "default": "<alias>|null" }
function loadCredStore() {
  try {
    const s = JSON.parse(readFileSync(CRED_STORE, 'utf8'))
    if (!s.accounts) s.accounts = {}
    if (!('default' in s)) s.default = null
    return s
  } catch { return { accounts: {}, default: null } }
}
function saveCredStore(store) { writeFileSync(CRED_STORE, JSON.stringify(store, null, 2) + '\n') }
function fingerprint(s) { if (!s) return null; return s.length <= 8 ? '••••' : `…${s.slice(-4)} (len ${s.length})` }
function resolveAccount() {
  const store = loadCredStore()
  const aliases = Object.keys(store.accounts)
  const acct = ACCOUNT || store.default || (aliases.length === 1 ? aliases[0] : null)
  if (!acct) throw new Error(`No account selected. Pass --account <alias>. Available: ${aliases.join(', ') || '(none — add one with: calendar.mjs creds set <alias> ...)'}`)
  const entry = store.accounts[acct]
  if (!entry) throw new Error(`Unknown account '${acct}'. Available: ${aliases.join(', ') || '(none)'}`)
  return { acct, entry }
}
function requireCredentials() {
  // Env-var override: one-off escape hatch. Normal path is the store via --account.
  if (process.env.GCAL_CLIENT_ID && process.env.GCAL_CLIENT_SECRET && process.env.GCAL_REFRESH_TOKEN) {
    return { clientId: process.env.GCAL_CLIENT_ID, clientSecret: process.env.GCAL_CLIENT_SECRET, refreshToken: process.env.GCAL_REFRESH_TOKEN }
  }
  const { acct, entry } = resolveAccount()
  const missing = ['client_id', 'client_secret', 'refresh_token'].filter(k => !entry[k])
  if (missing.length) throw new Error(`Account '${acct}' is missing: ${missing.join(', ')}. Set with: calendar.mjs creds set ${acct} --client-id ... --client-secret ... --refresh-token ...`)
  return { clientId: entry.client_id, clientSecret: entry.client_secret, refreshToken: entry.refresh_token }
}

function manageCreds(argv) {
  const sub = argv[0]
  const store = loadCredStore()
  if (sub === 'list' || !sub) {
    const accounts = Object.entries(store.accounts).map(([alias, e]) => ({ account: alias, email: e.email ?? null, default: store.default === alias, client_id: fingerprint(e.client_id), client_secret: fingerprint(e.client_secret), refresh_token: fingerprint(e.refresh_token) }))
    console.log(JSON.stringify({ accounts, default: store.default }, null, 2)); return
  }
  if (sub === 'set') {
    const alias = argv[1]
    if (!alias) { console.error('Usage: calendar.mjs creds set <alias> [--email E] [--client-id ID] [--client-secret S] [--refresh-token T] [--default] [--stdin]'); process.exit(1) }
    const entry = store.accounts[alias] ?? {}
    let useStdin = false, makeDefault = false
    const flag = { '--email': 'email', '--client-id': 'client_id', '--client-secret': 'client_secret', '--refresh-token': 'refresh_token' }
    for (let i = 2; i < argv.length; i++) {
      if (flag[argv[i]]) entry[flag[argv[i]]] = argv[++i]
      else if (argv[i] === '--stdin') useStdin = true
      else if (argv[i] === '--default') makeDefault = true
    }
    if (useStdin) { const blob = JSON.parse(readFileSync(0, 'utf8')); for (const k of ['email', 'client_id', 'client_secret', 'refresh_token']) if (blob[k] != null) entry[k] = blob[k] }
    store.accounts[alias] = entry
    if (makeDefault || store.default == null) store.default = alias
    saveCredStore(store)
    console.log(JSON.stringify({ ok: true, account: alias, default: store.default, email: entry.email ?? null, client_id: fingerprint(entry.client_id), client_secret: fingerprint(entry.client_secret), refresh_token: fingerprint(entry.refresh_token) }, null, 2)); return
  }
  if (sub === 'set-default') {
    const alias = argv[1]
    if (!alias || !store.accounts[alias]) { console.error(`Unknown account '${alias}'. Available: ${Object.keys(store.accounts).join(', ') || '(none)'}`); process.exit(1) }
    store.default = alias; saveCredStore(store); console.log(JSON.stringify({ ok: true, default: alias })); return
  }
  if (sub === 'remove' || sub === 'rm') {
    const alias = argv[1]
    if (!alias || !store.accounts[alias]) { console.error(`Unknown account '${alias}'. Available: ${Object.keys(store.accounts).join(', ') || '(none)'}`); process.exit(1) }
    delete store.accounts[alias]; if (store.default === alias) store.default = Object.keys(store.accounts)[0] ?? null
    saveCredStore(store); console.log(JSON.stringify({ ok: true, removed: alias, default: store.default })); return
  }
  console.error(`Unknown creds subcommand '${sub}'. Use: list | set | set-default | remove`); process.exit(1)
}

// Token cache keyed by hash of client_id + refresh_token (accounts never collide).
function loadTokenCache() {
  try { return JSON.parse(readFileSync(TOKEN_CACHE, 'utf8')) } catch { return {} }
}

function saveTokenCache(cache) {
  writeFileSync(TOKEN_CACHE, JSON.stringify(cache))
}

async function getAccessToken() {
  const { clientId, clientSecret, refreshToken } = requireCredentials()
  const cache = loadTokenCache()
  const key = createHash('sha256').update(`${clientId}:${refreshToken}`).digest('hex').slice(0, 16)
  const entry = cache[key]
  if (entry?.access_token && entry?.expiry && Date.now() < entry.expiry - 60_000) {
    return entry.access_token
  }
  const resp = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id:     clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type:    'refresh_token',
    }),
  })
  if (!resp.ok) {
    const err = await resp.text()
    throw new Error(`Token refresh failed (${resp.status}): ${err}`)
  }
  const data = await resp.json()
  cache[key] = { access_token: data.access_token, expiry: Date.now() + data.expires_in * 1000 }
  saveTokenCache(cache)
  return data.access_token
}

async function calFetch(path, options = {}) {
  const token = await getAccessToken()
  const url = path.startsWith('http') ? path : `${CALENDAR_API}${path}`
  const resp = await fetch(url, {
    ...options,
    headers: { Authorization: `Bearer ${token}`, ...options.headers },
  })
  if (!resp.ok) {
    const err = await resp.text()
    throw new Error(`Calendar API ${resp.status}: ${err}`)
  }
  if (resp.status === 204) return null
  return resp.json()
}

function formatEvent(e) {
  return {
    id: e.id,
    summary: e.summary ?? '(no title)',
    description: e.description,
    location: e.location,
    start: e.start?.dateTime ?? e.start?.date,
    end: e.end?.dateTime ?? e.end?.date,
    allDay: !!e.start?.date,
    status: e.status,
    organizer: e.organizer?.email,
    attendees: e.attendees?.map(a => ({ email: a.email, name: a.displayName, status: a.responseStatus })),
    htmlLink: e.htmlLink,
    recurrence: e.recurrence,
    recurringEventId: e.recurringEventId,
  }
}

const [cmd, ...rawArgs] = process.argv.slice(2)

// Pull --account / -a out so per-command parsing doesn't see it.
const args = []
for (let i = 0; i < rawArgs.length; i++) {
  const a = rawArgs[i]
  if (a === '--account' || a === '-a') ACCOUNT = rawArgs[++i]
  else if (a.startsWith('--account=')) ACCOUNT = a.slice('--account='.length)
  else args.push(a)
}

if (cmd === 'creds') { manageCreds(args); process.exit(0) }

if (!cmd || cmd === '--help' || cmd === '-h') {
  console.log(`Usage: calendar.mjs <command> [--account <alias>] [options]

Credentials are stored per-account in .google-calendar-credentials.json and selected with
--account <alias> (or -a). You never pass secrets for normal use. Manage with 'creds' below.
(Escape hatch: GCAL_CLIENT_ID/SECRET/REFRESH_TOKEN env vars override the store if all set.)

Credential management:
  creds list                                List accounts (emails + masked fingerprints)
  creds set <alias> [--email E] [--client-id ID] [--client-secret S] [--refresh-token T] [--default]
  creds set-default <alias>
  creds remove <alias>

Commands:
  auth-url [--account A]                     Print OAuth authorization URL (client id from the account)
  auth-exchange <code> [--account A]         Exchange auth code; with --account, store the refresh token
  token                                     Print current access token
  calendars                                 List all calendars
  list [--calendar C] [--from DATE] [--to DATE] [--max N] [--query Q]
                                            List events (default: primary, from now, max 20)
  get <eventId> [--calendar C]              Get event details
  create --summary S [--calendar C] [--start DATETIME] [--end DATETIME]
         [--description D] [--location L] [--attendees A,B,...] [--all-day]
                                            Create a new event
  update <eventId> [--calendar C] [--summary S] [--start DATETIME] [--end DATETIME]
         [--description D] [--location L]   Update an existing event
  delete <eventId> [--calendar C]           Delete an event
  quick-add <text> [--calendar C]           Create event from natural language text`)
  process.exit(0)
}

try {
  switch (cmd) {
    case 'auth-url': {
      const clientId = process.env.GCAL_CLIENT_ID || resolveAccount().entry.client_id
      if (!clientId) { console.error('No client_id available. Set one with: calendar.mjs creds set <alias> --client-id ...'); process.exit(1) }
      const params = new URLSearchParams({
        client_id:     clientId,
        redirect_uri:  REDIRECT_URI,
        response_type: 'code',
        scope:         SCOPES,
        access_type:   'offline',
        prompt:        'consent',
      })
      console.log(`${AUTH_URL}?${params}`)
      break
    }

    case 'auth-exchange': {
      const code = args[0]
      if (!code) { console.error('Usage: calendar.mjs auth-exchange <code> [--account <alias>]'); process.exit(1) }
      let clientId = process.env.GCAL_CLIENT_ID, clientSecret = process.env.GCAL_CLIENT_SECRET, storeAcct = null
      if (!clientId || !clientSecret) {
        const { acct, entry } = resolveAccount()
        storeAcct = acct
        clientId = clientId || entry.client_id
        clientSecret = clientSecret || entry.client_secret
      }
      const resp = await fetch(TOKEN_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          code,
          client_id:     clientId,
          client_secret: clientSecret,
          redirect_uri:  REDIRECT_URI,
          grant_type:    'authorization_code',
        }),
      })
      const data = await resp.json()
      if (!resp.ok) {
        console.error(JSON.stringify({ error: data.error, description: data.error_description }))
        process.exit(1)
      }
      const cache = loadTokenCache()
      const exKey = createHash('sha256').update(`${clientId}:${data.refresh_token}`).digest('hex').slice(0, 16)
      cache[exKey] = { access_token: data.access_token, expiry: Date.now() + data.expires_in * 1000 }
      saveTokenCache(cache)
      if (storeAcct) {
        const store = loadCredStore()
        store.accounts[storeAcct] = { ...store.accounts[storeAcct], refresh_token: data.refresh_token }
        saveCredStore(store)
        console.log(JSON.stringify({ ok: true, account: storeAcct, refresh_token: fingerprint(data.refresh_token), scope: data.scope, stored: true }, null, 2))
      } else {
        console.log(JSON.stringify({ ok: true, refresh_token: data.refresh_token, scope: data.scope }))
      }
      break
    }

    case 'token': {
      console.log(await getAccessToken())
      break
    }

    case 'calendars': {
      const data = await calFetch('/users/me/calendarList')
      const calendars = (data.items ?? []).map(c => ({
        id: c.id,
        summary: c.summary,
        description: c.description,
        primary: c.primary ?? false,
        accessRole: c.accessRole,
        backgroundColor: c.backgroundColor,
      }))
      console.log(JSON.stringify(calendars, null, 2))
      break
    }

    case 'list': {
      let calendarId = 'primary', from = '', to = '', max = 20, query = ''
      for (let i = 0; i < args.length; i++) {
        if (args[i] === '--calendar' || args[i] === '-c') calendarId = args[++i]
        else if (args[i] === '--from') from = args[++i]
        else if (args[i] === '--to') to = args[++i]
        else if (args[i] === '--max' || args[i] === '-n') max = parseInt(args[++i])
        else if (args[i] === '--query' || args[i] === '-q') query = args[++i]
      }
      const params = new URLSearchParams({
        maxResults:   String(max),
        singleEvents: 'true',
        orderBy:      'startTime',
        timeMin:      from ? new Date(from).toISOString() : new Date().toISOString(),
      })
      if (to) params.set('timeMax', new Date(to).toISOString())
      if (query) params.set('q', query)
      const data = await calFetch(`/calendars/${encodeURIComponent(calendarId)}/events?${params}`)
      const events = (data.items ?? []).map(formatEvent)
      console.log(JSON.stringify({ calendarId, events, nextPageToken: data.nextPageToken }, null, 2))
      break
    }

    case 'get': {
      const eventId = args[0]
      if (!eventId) { console.error('Usage: calendar.mjs get <eventId> [--calendar C]'); process.exit(1) }
      let calendarId = 'primary'
      for (let i = 1; i < args.length; i++) {
        if (args[i] === '--calendar' || args[i] === '-c') calendarId = args[++i]
      }
      const event = await calFetch(`/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`)
      console.log(JSON.stringify(formatEvent(event), null, 2))
      break
    }

    case 'create': {
      let calendarId = 'primary', summary = '', start = '', end = '', description = '', location = '', attendeeStr = '', allDay = false
      for (let i = 0; i < args.length; i++) {
        if (args[i] === '--calendar' || args[i] === '-c') calendarId = args[++i]
        else if (args[i] === '--summary'     || args[i] === '-s') summary     = args[++i]
        else if (args[i] === '--start')                           start       = args[++i]
        else if (args[i] === '--end')                             end         = args[++i]
        else if (args[i] === '--description' || args[i] === '-d') description = args[++i]
        else if (args[i] === '--location'    || args[i] === '-l') location    = args[++i]
        else if (args[i] === '--attendees')                       attendeeStr = args[++i]
        else if (args[i] === '--all-day')                         allDay      = true
      }
      if (!summary) {
        console.error('Usage: calendar.mjs create --summary S [--calendar C] [--start DATETIME] [--end DATETIME] [--description D] [--location L] [--attendees A,B,...] [--all-day]')
        process.exit(1)
      }
      const body = { summary }
      if (description) body.description = description
      if (location)    body.location    = location
      if (attendeeStr) body.attendees   = attendeeStr.split(',').map(e => ({ email: e.trim() }))
      if (allDay) {
        body.start = { date: start ? new Date(start).toISOString().slice(0, 10) : new Date().toISOString().slice(0, 10) }
        body.end   = { date: end   ? new Date(end).toISOString().slice(0, 10)   : new Date(Date.now() + 86400000).toISOString().slice(0, 10) }
      } else {
        body.start = { dateTime: start ? new Date(start).toISOString() : new Date().toISOString() }
        body.end   = { dateTime: end   ? new Date(end).toISOString()   : new Date(Date.now() + 3600000).toISOString() }
      }
      const event = await calFetch(`/calendars/${encodeURIComponent(calendarId)}/events`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      console.log(JSON.stringify(formatEvent(event), null, 2))
      break
    }

    case 'update': {
      const eventId = args[0]
      if (!eventId) {
        console.error('Usage: calendar.mjs update <eventId> [--calendar C] [--summary S] [--start DATETIME] [--end DATETIME] [--description D] [--location L]')
        process.exit(1)
      }
      let calendarId = 'primary', summary = '', start = '', end = '', description = '', location = ''
      for (let i = 1; i < args.length; i++) {
        if (args[i] === '--calendar' || args[i] === '-c') calendarId  = args[++i]
        else if (args[i] === '--summary'     || args[i] === '-s') summary     = args[++i]
        else if (args[i] === '--start')                           start       = args[++i]
        else if (args[i] === '--end')                             end         = args[++i]
        else if (args[i] === '--description' || args[i] === '-d') description = args[++i]
        else if (args[i] === '--location'    || args[i] === '-l') location    = args[++i]
      }
      const existing = await calFetch(`/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`)
      const body = { ...existing }
      if (summary)     body.summary     = summary
      if (description) body.description = description
      if (location)    body.location    = location
      if (start) {
        body.start = existing.start?.date
          ? { date: new Date(start).toISOString().slice(0, 10) }
          : { dateTime: new Date(start).toISOString(), timeZone: existing.start?.timeZone }
      }
      if (end) {
        body.end = existing.end?.date
          ? { date: new Date(end).toISOString().slice(0, 10) }
          : { dateTime: new Date(end).toISOString(), timeZone: existing.end?.timeZone }
      }
      const updated = await calFetch(`/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      console.log(JSON.stringify(formatEvent(updated), null, 2))
      break
    }

    case 'delete': {
      const eventId = args[0]
      if (!eventId) { console.error('Usage: calendar.mjs delete <eventId> [--calendar C]'); process.exit(1) }
      let calendarId = 'primary'
      for (let i = 1; i < args.length; i++) {
        if (args[i] === '--calendar' || args[i] === '-c') calendarId = args[++i]
      }
      await calFetch(`/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`, {
        method: 'DELETE',
      })
      console.log(JSON.stringify({ ok: true, deleted: eventId }))
      break
    }

    case 'quick-add': {
      let calendarId = 'primary'
      const textParts = []
      for (let i = 0; i < args.length; i++) {
        if ((args[i] === '--calendar' || args[i] === '-c') && args[i + 1]) calendarId = args[++i]
        else textParts.push(args[i])
      }
      const text = textParts.join(' ')
      if (!text) { console.error('Usage: calendar.mjs quick-add <text> [--calendar C]'); process.exit(1) }
      const params = new URLSearchParams({ text })
      const event = await calFetch(`/calendars/${encodeURIComponent(calendarId)}/events/quickAdd?${params}`, {
        method: 'POST',
      })
      console.log(JSON.stringify(formatEvent(event), null, 2))
      break
    }

    default:
      console.error(`Unknown command: ${cmd}. Run calendar.mjs --help`)
      process.exit(1)
  }
} catch (err) {
  console.error(JSON.stringify({ error: err.message }))
  process.exit(1)
}
