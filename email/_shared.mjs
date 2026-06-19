// _shared.mjs — Shared utilities for email scripts.

import { ImapFlow } from 'imapflow'
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

export const EXIT = {
  OK:         0,
  USAGE:      1,
  AUTH:       2,
  CONNECTION: 3,
  NOT_FOUND:  4,
}

const SKILL_DIR = import.meta.dirname
const CRED_STORE = process.env.EMAIL_CRED_STORE || join(SKILL_DIR, '.email-credentials.json')

// ── Credentials store ─────────────────────────────────────────────────────────
// Secrets (imap_pass/smtp_pass) and per-account IMAP/SMTP config live here, keyed
// by short account alias, so the agent references an account by name (--account
// <alias>) instead of pasting passwords. See .email-credentials.json for shape:
//   { "accounts": { "<alias>": { label, imap_host, imap_port, imap_user, imap_pass,
//                                 smtp_host, smtp_port, smtp_user, smtp_pass, smtp_from } }, "default": ... }
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

// Extract --account/-a from argv at load (before entry scripts parse args with
// strict parsers), storing the value and removing it from argv.
const SELECTED_ACCOUNT = (() => {
  const a = process.argv
  for (let i = 2; i < a.length; i++) {
    if ((a[i] === '--account' || a[i] === '-a') && a[i + 1] !== undefined) { const v = a[i + 1]; a.splice(i, 2); return v }
    if (a[i].startsWith('--account=')) { const v = a[i].slice('--account='.length); a.splice(i, 1); return v }
  }
  return process.env.EMAIL_ACCOUNT || null
})()

function resolveAccountSoft() {
  const store = loadCredStore()
  const aliases = Object.keys(store.accounts)
  const acct = SELECTED_ACCOUNT || store.default || (aliases.length === 1 ? aliases[0] : null)
  if (!acct || !store.accounts[acct]) return { acct: null, entry: {}, aliases }
  return { acct, entry: store.accounts[acct], aliases }
}

// Resolved-account field with env fallback.
export function accountField(name, envVar) {
  const { entry } = resolveAccountSoft()
  return entry[name] ?? (envVar ? process.env[envVar] : null) ?? null
}

export function makeClient() {
  const host = accountField('imap_host', 'IMAP_HOST')
  const user = accountField('imap_user', 'IMAP_USER')
  const pass = accountField('imap_pass', 'IMAP_PASS')
  if (!host) { console.error('No imap_host. Set with: node creds.mjs set <alias> --imap-host ... (or IMAP_HOST env)'); process.exit(EXIT.AUTH) }
  if (!user) { console.error('No imap_user. Set with: node creds.mjs set <alias> --imap-user ... (or IMAP_USER env)'); process.exit(EXIT.AUTH) }
  if (!pass) { console.error('No imap_pass. Set with: node creds.mjs set <alias> --imap-pass ... (or IMAP_PASS env)'); process.exit(EXIT.AUTH) }

  return new ImapFlow({
    host,
    port: parseInt(accountField('imap_port', 'IMAP_PORT') ?? '993', 10),
    secure: true,
    auth: { user, pass },
    logger: false,
  })
}

// ── Credential management (CLI surface, used by creds.mjs) ─────────────────────
export function manageCreds(argv) {
  const sub = argv[0]
  const store = loadCredStore()
  const secretFields = ['imap_pass', 'smtp_pass']
  const plainFields = ['label', 'imap_host', 'imap_port', 'imap_user', 'smtp_host', 'smtp_port', 'smtp_user', 'smtp_from']
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
    if (!alias) { console.error('Usage: creds.mjs set <alias> [--imap-host H] [--imap-port P] [--imap-user U] [--imap-pass P] [--smtp-host H] [--smtp-port P] [--smtp-user U] [--smtp-pass P] [--smtp-from ADDR] [--label L] [--default] [--stdin]'); process.exit(EXIT.USAGE) }
    const entry = store.accounts[alias] ?? {}
    let useStdin = false, makeDefault = false
    const flag = { '--label': 'label', '--imap-host': 'imap_host', '--imap-port': 'imap_port', '--imap-user': 'imap_user', '--imap-pass': 'imap_pass', '--smtp-host': 'smtp_host', '--smtp-port': 'smtp_port', '--smtp-user': 'smtp_user', '--smtp-pass': 'smtp_pass', '--smtp-from': 'smtp_from' }
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

const DAY_NAMES = ['sunday','monday','tuesday','wednesday','thursday','friday','saturday']

/**
 * Parse a date argument. Accepts ISO 8601, relative expressions
 * (today, tomorrow, yesterday, next <weekday>, in N days/weeks/months, N units ago).
 * Returns a Date object; exits with USAGE on invalid input.
 */
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
