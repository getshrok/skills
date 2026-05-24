#!/usr/bin/env node

import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { createHash } from 'node:crypto'

const SKILL_DIR = import.meta.dirname
const TOKEN_CACHE = join(SKILL_DIR, '.token-cache')
const CRED_STORE = process.env.GW_CRED_STORE || join(SKILL_DIR, '.google-workspace-credentials.json')
const TOKEN_URL = 'https://oauth2.googleapis.com/token'
const AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth'
const SCOPES = [
  'https://www.googleapis.com/auth/drive',
  'https://www.googleapis.com/auth/documents',
  'https://www.googleapis.com/auth/spreadsheets',
].join(' ')
const REDIRECT_URI = 'http://localhost'

const DRIVE = 'https://www.googleapis.com/drive/v3'
const DRIVE_UPLOAD = 'https://www.googleapis.com/upload/drive/v3'
const DOCS = 'https://docs.googleapis.com/v1'
const SHEETS = 'https://sheets.googleapis.com/v4'

// Selected account alias (set from --account / -a). The model only passes this
// short alias; secrets stay inside the script.
let ACCOUNT = null

// ── Credentials store ─────────────────────────────────────────────────────────
// Secrets live here, keyed by short account alias. See the committed
// .google-workspace-credentials.json for the example shape:
//   { "accounts": { "<alias>": { email, client_id, client_secret, refresh_token } }, "default": "<alias>|null" }
function loadCredStore() {
  try {
    const s = JSON.parse(readFileSync(CRED_STORE, 'utf8'))
    if (!s.accounts) s.accounts = {}
    if (!('default' in s)) s.default = null
    return s
  } catch {
    return { accounts: {}, default: null }
  }
}
function saveCredStore(store) {
  writeFileSync(CRED_STORE, JSON.stringify(store, null, 2) + '\n')
}
function fingerprint(s) {
  if (!s) return null
  return s.length <= 8 ? '••••' : `…${s.slice(-4)} (len ${s.length})`
}
function resolveAccount() {
  const store = loadCredStore()
  const aliases = Object.keys(store.accounts)
  const acct = ACCOUNT || store.default || (aliases.length === 1 ? aliases[0] : null)
  if (!acct) throw new Error(`No account selected. Pass --account <alias>. Available: ${aliases.join(', ') || '(none — add one with: gw.mjs creds set <alias> ...)'}`)
  const entry = store.accounts[acct]
  if (!entry) throw new Error(`Unknown account '${acct}'. Available: ${aliases.join(', ') || '(none)'}`)
  return { acct, entry }
}
function requireCredentials() {
  // Env-var override: one-off escape hatch. Normal path is the store via --account.
  if (process.env.GW_CLIENT_ID && process.env.GW_CLIENT_SECRET && process.env.GW_REFRESH_TOKEN) {
    return { clientId: process.env.GW_CLIENT_ID, clientSecret: process.env.GW_CLIENT_SECRET, refreshToken: process.env.GW_REFRESH_TOKEN }
  }
  const { acct, entry } = resolveAccount()
  const missing = ['client_id', 'client_secret', 'refresh_token'].filter(k => !entry[k])
  if (missing.length) throw new Error(`Account '${acct}' is missing: ${missing.join(', ')}. Set with: gw.mjs creds set ${acct} --client-id ... --client-secret ... --refresh-token ...`)
  return { clientId: entry.client_id, clientSecret: entry.client_secret, refreshToken: entry.refresh_token }
}

function loadTokenCache() {
  try { return JSON.parse(readFileSync(TOKEN_CACHE, 'utf8')) } catch { return {} }
}
function saveTokenCache(cache) {
  writeFileSync(TOKEN_CACHE, JSON.stringify(cache))
}

async function getAccessToken() {
  const { clientId, clientSecret, refreshToken } = requireCredentials()
  const cache = loadTokenCache()
  // Key by hash of client_id + refresh_token so accounts never collide on cache.
  const key = createHash('sha256').update(`${clientId}:${refreshToken}`).digest('hex').slice(0, 16)
  const entry = cache[key]
  if (entry?.access_token && entry?.expiry && Date.now() < entry.expiry - 60_000) return entry.access_token
  const resp = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId, client_secret: clientSecret,
      refresh_token: refreshToken, grant_type: 'refresh_token',
    }),
  })
  if (!resp.ok) throw new Error(`Token refresh failed (${resp.status}): ${await resp.text()}`)
  const data = await resp.json()
  cache[key] = { access_token: data.access_token, expiry: Date.now() + data.expires_in * 1000 }
  saveTokenCache(cache)
  return data.access_token
}

async function gfetch(url, options = {}) {
  const token = await getAccessToken()
  const resp = await fetch(url, { ...options, headers: { Authorization: `Bearer ${token}`, ...options.headers } })
  if (!resp.ok) throw new Error(`Google API ${resp.status}: ${await resp.text()}`)
  return resp
}

async function gjson(url, options) { return (await gfetch(url, options)).json() }

function parseArgs(args) {
  const opts = {}; const positional = []
  for (let i = 0; i < args.length; i++) {
    if (args[i].startsWith('--')) { opts[args[i].slice(2)] = args[++i] } else { positional.push(args[i]) }
  }
  return { opts, positional }
}

const EXPORT_MIMES = {
  text: 'text/plain', csv: 'text/csv', pdf: 'application/pdf',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
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

if (!cmd || cmd === '--help' || cmd === '-h') {
  console.log(`Usage: gw.mjs <command> [--account <alias>] [options]

Credentials are stored per-account in .google-workspace-credentials.json and selected with
--account <alias> (or -a). You never pass secrets for normal use. Manage with 'creds' below.
(Escape hatch: GW_CLIENT_ID/SECRET/REFRESH_TOKEN env vars override the store if all set.)

Credential management:
  creds list                              List accounts (emails + masked fingerprints; no secrets)
  creds set <alias> [--email E] [--client-id ID] [--client-secret S] [--refresh-token T] [--default]
  creds set <alias> --stdin               Read a JSON {email,client_id,client_secret,refresh_token} from stdin
  creds set-default <alias>
  creds remove <alias>

Auth:
  auth-url [--account A]                   Print OAuth authorization URL (client id from the account)
  auth-exchange <code> [--account A]       Exchange auth code; with --account, store the refresh token

Drive:
  files [--query Q] [--max N]             List/search files
  info <fileId>                           Get file metadata
  export <fileId> --format text|csv|pdf|docx|xlsx   Export Google file
  download <fileId> --out PATH            Download file to disk
  upload --file PATH [--name N] [--folder ID] [--mime TYPE]
  mkdir --name NAME [--parent ID]         Create a folder
  move <fileId> --to FOLDERID             Move a file
  share <fileId> --email ADDR [--role reader|writer]
  trash <fileId>                          Move to trash

Docs:
  doc-create --title TITLE                Create a new Google Doc
  doc-read <docId>                        Read doc as plain text (via Drive export)
  doc-insert <docId> --text TEXT [--index N]   Insert text at position (default: end)
  doc-replace <docId> --find TEXT --replace TEXT   Replace all occurrences

Sheets:
  sheet-create --title TITLE              Create a new spreadsheet
  sheet-read <spreadsheetId> --range RANGE   Read a range (A1 notation)
  sheet-write <spreadsheetId> --range RANGE --values '[[...]]'   Write values
  sheet-append <spreadsheetId> --range RANGE --values '[[...]]'  Append rows`)
  process.exit(0)
}

try {
  const { opts, positional } = parseArgs(args)

  switch (cmd) {
    // ── Credential management ───────────────────────────────────────────────
    case 'creds': {
      const sub = positional[0]
      const store = loadCredStore()
      if (sub === 'list' || !sub) {
        const accounts = Object.entries(store.accounts).map(([alias, e]) => ({
          account: alias, email: e.email ?? null, default: store.default === alias,
          client_id: fingerprint(e.client_id), client_secret: fingerprint(e.client_secret), refresh_token: fingerprint(e.refresh_token),
        }))
        console.log(JSON.stringify({ accounts, default: store.default }, null, 2))
      } else if (sub === 'set') {
        const alias = positional[1]
        if (!alias) { console.error('Usage: gw.mjs creds set <alias> [--email E] [--client-id ID] [--client-secret S] [--refresh-token T] [--default] [--stdin]'); process.exit(1) }
        const entry = store.accounts[alias] ?? {}
        if (opts.email !== undefined) entry.email = opts.email
        if (opts['client-id'] !== undefined) entry.client_id = opts['client-id']
        if (opts['client-secret'] !== undefined) entry.client_secret = opts['client-secret']
        if (opts['refresh-token'] !== undefined) entry.refresh_token = opts['refresh-token']
        if (opts.stdin !== undefined || args.includes('--stdin')) {
          const blob = JSON.parse(readFileSync(0, 'utf8'))
          for (const k of ['email', 'client_id', 'client_secret', 'refresh_token']) if (blob[k] != null) entry[k] = blob[k]
        }
        store.accounts[alias] = entry
        if (opts.default !== undefined || args.includes('--default') || store.default == null) store.default = alias
        saveCredStore(store)
        console.log(JSON.stringify({ ok: true, account: alias, default: store.default, email: entry.email ?? null,
          client_id: fingerprint(entry.client_id), client_secret: fingerprint(entry.client_secret), refresh_token: fingerprint(entry.refresh_token) }, null, 2))
      } else if (sub === 'set-default') {
        const alias = positional[1]
        if (!alias || !store.accounts[alias]) { console.error(`Unknown account '${alias}'. Available: ${Object.keys(store.accounts).join(', ') || '(none)'}`); process.exit(1) }
        store.default = alias; saveCredStore(store); console.log(JSON.stringify({ ok: true, default: alias }))
      } else if (sub === 'remove' || sub === 'rm') {
        const alias = positional[1]
        if (!alias || !store.accounts[alias]) { console.error(`Unknown account '${alias}'. Available: ${Object.keys(store.accounts).join(', ') || '(none)'}`); process.exit(1) }
        delete store.accounts[alias]
        if (store.default === alias) store.default = Object.keys(store.accounts)[0] ?? null
        saveCredStore(store); console.log(JSON.stringify({ ok: true, removed: alias, default: store.default }))
      } else {
        console.error(`Unknown creds subcommand '${sub}'. Use: list | set | set-default | remove`); process.exit(1)
      }
      break
    }

    // ── Auth ──────────────────────────────────────────────────────────────
    case 'auth-url': {
      const { entry } = resolveAccount()
      const clientId = process.env.GW_CLIENT_ID || entry.client_id
      if (!clientId) { console.error('No client_id available. Set one with: gw.mjs creds set <alias> --client-id ...'); process.exit(1) }
      const params = new URLSearchParams({
        client_id: clientId, redirect_uri: REDIRECT_URI,
        response_type: 'code', scope: SCOPES, access_type: 'offline', prompt: 'consent',
      })
      console.log(`${AUTH_URL}?${params}`)
      break
    }
    case 'auth-exchange': {
      const code = positional[0]
      if (!code) { console.error('Usage: gw.mjs auth-exchange <code> [--account <alias>]'); process.exit(1) }
      let clientId = process.env.GW_CLIENT_ID, clientSecret = process.env.GW_CLIENT_SECRET, storeAcct = null
      if (!clientId || !clientSecret) {
        const { acct, entry } = resolveAccount()
        storeAcct = acct
        clientId = clientId || entry.client_id
        clientSecret = clientSecret || entry.client_secret
      }
      const resp = await fetch(TOKEN_URL, {
        method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          code, client_id: clientId, client_secret: clientSecret,
          redirect_uri: REDIRECT_URI, grant_type: 'authorization_code',
        }),
      })
      const data = await resp.json()
      if (!resp.ok) { console.error(JSON.stringify({ error: data.error, description: data.error_description })); process.exit(1) }
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

    // ── Drive ─────────────────────────────────────────────────────────────
    case 'files': {
      const params = new URLSearchParams({ pageSize: String(opts.max || 20), fields: 'files(id,name,mimeType,modifiedTime,size,webViewLink)' })
      if (opts.query) params.set('q', opts.query)
      const data = await gjson(`${DRIVE}/files?${params}`)
      console.log(JSON.stringify(data.files?.map(f => ({
        id: f.id, name: f.name, type: f.mimeType, modified: f.modifiedTime, size: f.size, url: f.webViewLink,
      })) ?? [], null, 2))
      break
    }
    case 'info': {
      const id = positional[0]
      if (!id) { console.error('Usage: gw.mjs info <fileId>'); process.exit(1) }
      const data = await gjson(`${DRIVE}/files/${id}?fields=id,name,mimeType,size,createdTime,modifiedTime,webViewLink,parents`)
      console.log(JSON.stringify(data, null, 2))
      break
    }
    case 'export': {
      const id = positional[0]
      const format = opts.format
      if (!id || !format) { console.error('Usage: gw.mjs export <fileId> --format text|csv|pdf|docx|xlsx'); process.exit(1) }
      const mime = EXPORT_MIMES[format]
      if (!mime) { console.error(`Unknown format: ${format}. Use: ${Object.keys(EXPORT_MIMES).join(', ')}`); process.exit(1) }
      const resp = await gfetch(`${DRIVE}/files/${id}/export?mimeType=${encodeURIComponent(mime)}`)
      if (format === 'pdf' || format === 'docx' || format === 'xlsx') {
        const outPath = opts.out || `export.${format}`
        const buf = Buffer.from(await resp.arrayBuffer())
        writeFileSync(outPath, buf)
        console.log(JSON.stringify({ ok: true, path: outPath, bytes: buf.length }))
      } else {
        console.log(await resp.text())
      }
      break
    }
    case 'download': {
      const id = positional[0]
      if (!id || !opts.out) { console.error('Usage: gw.mjs download <fileId> --out PATH'); process.exit(1) }
      const resp = await gfetch(`${DRIVE}/files/${id}?alt=media`)
      const buf = Buffer.from(await resp.arrayBuffer())
      writeFileSync(opts.out, buf)
      console.log(JSON.stringify({ ok: true, path: opts.out, bytes: buf.length }))
      break
    }
    case 'upload': {
      if (!opts.file) { console.error('Usage: gw.mjs upload --file PATH [--name N] [--folder ID] [--mime TYPE]'); process.exit(1) }
      const fileContent = readFileSync(opts.file)
      const metadata = { name: opts.name || opts.file.split('/').pop() }
      if (opts.folder) metadata.parents = [opts.folder]
      const boundary = '---shrok-upload-boundary'
      const body = Buffer.concat([
        Buffer.from(`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n--${boundary}\r\nContent-Type: ${opts.mime || 'application/octet-stream'}\r\n\r\n`),
        fileContent,
        Buffer.from(`\r\n--${boundary}--`),
      ])
      const data = await gjson(`${DRIVE_UPLOAD}/files?uploadType=multipart`, {
        method: 'POST',
        headers: { 'Content-Type': `multipart/related; boundary=${boundary}` },
        body,
      })
      console.log(JSON.stringify({ id: data.id, name: data.name }, null, 2))
      break
    }
    case 'mkdir': {
      if (!opts.name) { console.error('Usage: gw.mjs mkdir --name NAME [--parent ID]'); process.exit(1) }
      const body = { name: opts.name, mimeType: 'application/vnd.google-apps.folder' }
      if (opts.parent) body.parents = [opts.parent]
      const data = await gjson(`${DRIVE}/files`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      })
      console.log(JSON.stringify({ id: data.id, name: data.name }, null, 2))
      break
    }
    case 'move': {
      const id = positional[0]
      if (!id || !opts.to) { console.error('Usage: gw.mjs move <fileId> --to FOLDERID'); process.exit(1) }
      const current = await gjson(`${DRIVE}/files/${id}?fields=parents`)
      const removeParents = current.parents?.join(',') || ''
      await gjson(`${DRIVE}/files/${id}?addParents=${opts.to}&removeParents=${removeParents}`, { method: 'PATCH' })
      console.log(JSON.stringify({ ok: true }))
      break
    }
    case 'share': {
      const id = positional[0]
      if (!id || !opts.email) { console.error('Usage: gw.mjs share <fileId> --email ADDR [--role reader|writer]'); process.exit(1) }
      await gjson(`${DRIVE}/files/${id}/permissions`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role: opts.role || 'reader', type: 'user', emailAddress: opts.email }),
      })
      console.log(JSON.stringify({ ok: true, shared: opts.email, role: opts.role || 'reader' }))
      break
    }
    case 'trash': {
      const id = positional[0]
      if (!id) { console.error('Usage: gw.mjs trash <fileId>'); process.exit(1) }
      await gjson(`${DRIVE}/files/${id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ trashed: true }),
      })
      console.log(JSON.stringify({ ok: true, trashed: id }))
      break
    }

    // ── Docs ──────────────────────────────────────────────────────────────
    case 'doc-create': {
      if (!opts.title) { console.error('Usage: gw.mjs doc-create --title TITLE'); process.exit(1) }
      const data = await gjson(`${DOCS}/documents`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: opts.title }),
      })
      console.log(JSON.stringify({ id: data.documentId, title: data.title, url: `https://docs.google.com/document/d/${data.documentId}/edit` }, null, 2))
      break
    }
    case 'doc-read': {
      const id = positional[0]
      if (!id) { console.error('Usage: gw.mjs doc-read <docId>'); process.exit(1) }
      const resp = await gfetch(`${DRIVE}/files/${id}/export?mimeType=text/plain`)
      console.log(await resp.text())
      break
    }
    case 'doc-insert': {
      const id = positional[0]
      if (!id || !opts.text) { console.error('Usage: gw.mjs doc-insert <docId> --text TEXT [--index N]'); process.exit(1) }
      const index = opts.index ? parseInt(opts.index) : undefined
      const requests = []
      if (index) {
        requests.push({ insertText: { location: { index }, text: opts.text } })
      } else {
        // Append: get doc length first
        const doc = await gjson(`${DOCS}/documents/${id}`)
        const endIndex = doc.body.content[doc.body.content.length - 1].endIndex - 1
        requests.push({ insertText: { location: { index: endIndex }, text: opts.text } })
      }
      await gjson(`${DOCS}/documents/${id}:batchUpdate`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ requests }),
      })
      console.log(JSON.stringify({ ok: true }))
      break
    }
    case 'doc-replace': {
      const id = positional[0]
      if (!id || !opts.find || !opts.replace) { console.error('Usage: gw.mjs doc-replace <docId> --find TEXT --replace TEXT'); process.exit(1) }
      await gjson(`${DOCS}/documents/${id}:batchUpdate`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ requests: [{ replaceAllText: { containsText: { text: opts.find, matchCase: true }, replaceText: opts.replace } }] }),
      })
      console.log(JSON.stringify({ ok: true }))
      break
    }

    // ── Sheets ────────────────────────────────────────────────────────────
    case 'sheet-create': {
      if (!opts.title) { console.error('Usage: gw.mjs sheet-create --title TITLE'); process.exit(1) }
      const data = await gjson(`${SHEETS}/spreadsheets`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ properties: { title: opts.title } }),
      })
      console.log(JSON.stringify({ id: data.spreadsheetId, title: data.properties.title, url: data.spreadsheetUrl }, null, 2))
      break
    }
    case 'sheet-read': {
      const id = positional[0]
      if (!id || !opts.range) { console.error('Usage: gw.mjs sheet-read <spreadsheetId> --range RANGE'); process.exit(1) }
      const data = await gjson(`${SHEETS}/spreadsheets/${id}/values/${encodeURIComponent(opts.range)}`)
      console.log(JSON.stringify({ range: data.range, values: data.values }, null, 2))
      break
    }
    case 'sheet-write': {
      const id = positional[0]
      if (!id || !opts.range || !opts.values) { console.error('Usage: gw.mjs sheet-write <spreadsheetId> --range RANGE --values \'[[...]]\''); process.exit(1) }
      const values = JSON.parse(opts.values)
      await gjson(`${SHEETS}/spreadsheets/${id}/values/${encodeURIComponent(opts.range)}?valueInputOption=USER_ENTERED`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ values }),
      })
      console.log(JSON.stringify({ ok: true }))
      break
    }
    case 'sheet-append': {
      const id = positional[0]
      if (!id || !opts.range || !opts.values) { console.error('Usage: gw.mjs sheet-append <spreadsheetId> --range RANGE --values \'[[...]]\''); process.exit(1) }
      const values = JSON.parse(opts.values)
      await gjson(`${SHEETS}/spreadsheets/${id}/values/${encodeURIComponent(opts.range)}:append?valueInputOption=USER_ENTERED`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ values }),
      })
      console.log(JSON.stringify({ ok: true }))
      break
    }

    default:
      console.error(`Unknown command: ${cmd}. Run gw.mjs --help`)
      process.exit(1)
  }
} catch (err) {
  console.error(JSON.stringify({ error: err.message }))
  process.exit(1)
}
