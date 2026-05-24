#!/usr/bin/env node

import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const SKILL_DIR = import.meta.dirname
const TOKEN_CACHE = join(SKILL_DIR, '.token-cache')
const CRED_STORE = process.env.GMAIL_CRED_STORE || join(SKILL_DIR, '.gmail-credentials.json')
const GMAIL_API = 'https://gmail.googleapis.com/gmail/v1/users/me'
const TOKEN_URL = 'https://oauth2.googleapis.com/token'
const AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth'
const SCOPES = 'https://mail.google.com/'
const REDIRECT_URI = 'http://localhost'

// Selected account alias (set from --account / -a during dispatch). The model
// only ever passes this short alias; it never types the secret values.
let ACCOUNT = null

// ── Credentials store ─────────────────────────────────────────────────────────
// Secrets live here, keyed by short account alias, so the model references an
// account by name instead of pasting long opaque tokens on the command line.
// Shape: { "accounts": { "<alias>": { email, client_id, client_secret, refresh_token } }, "default": "<alias>|null" }

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

// Show only a short fingerprint of a secret so it can be eyeballed/verified
// without ever printing (or requiring the model to copy) the full value.
function fingerprint(s) {
  if (!s) return null
  return s.length <= 8 ? '••••' : `…${s.slice(-4)} (len ${s.length})`
}

function resolveAccount() {
  const store = loadCredStore()
  const aliases = Object.keys(store.accounts)
  const acct = ACCOUNT || store.default || (aliases.length === 1 ? aliases[0] : null)
  if (!acct) {
    throw new Error(
      `No account selected. Pass --account <alias>.\n` +
      `Available accounts: ${aliases.length ? aliases.join(', ') : '(none — add one with: gmail.mjs creds set <alias> ...)'}`
    )
  }
  const entry = store.accounts[acct]
  if (!entry) {
    throw new Error(`Unknown account '${acct}'. Available: ${aliases.join(', ') || '(none)'}`)
  }
  return { acct, entry }
}

function requireCredentials() {
  // Env-var override: a one-off escape hatch for testing. The normal path is the
  // credentials store via --account, so the model doesn't handle secrets at all.
  if (process.env.GMAIL_CLIENT_ID && process.env.GMAIL_CLIENT_SECRET && process.env.GMAIL_REFRESH_TOKEN) {
    return {
      clientId:     process.env.GMAIL_CLIENT_ID,
      clientSecret: process.env.GMAIL_CLIENT_SECRET,
      refreshToken: process.env.GMAIL_REFRESH_TOKEN,
    }
  }
  const { acct, entry } = resolveAccount()
  const missing = ['client_id', 'client_secret', 'refresh_token'].filter(k => !entry[k])
  if (missing.length) {
    throw new Error(
      `Account '${acct}' is missing: ${missing.join(', ')}.\n` +
      `Set them with: gmail.mjs creds set ${acct} --client-id ... --client-secret ... --refresh-token ...`
    )
  }
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
  const entry = cache[clientId]
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
  cache[clientId] = { access_token: data.access_token, expiry: Date.now() + data.expires_in * 1000 }
  saveTokenCache(cache)
  return data.access_token
}

async function gmailFetch(path, options = {}) {
  const token = await getAccessToken()
  const resp = await fetch(`${GMAIL_API}${path}`, {
    ...options,
    headers: { Authorization: `Bearer ${token}`, ...options.headers },
  })
  if (!resp.ok) {
    const err = await resp.text()
    throw new Error(`Gmail API ${resp.status}: ${err}`)
  }
  if (resp.status === 204) return null
  return resp.json()
}

function extractBody(payload) {
  if (!payload) return ''
  if (payload.body?.data) return Buffer.from(payload.body.data, 'base64url').toString('utf-8')
  if (payload.parts) {
    for (const part of payload.parts) {
      if (part.mimeType === 'text/plain' && part.body?.data)
        return Buffer.from(part.body.data, 'base64url').toString('utf-8')
    }
    for (const part of payload.parts) {
      if (part.parts || part.mimeType?.startsWith('multipart/')) {
        const result = extractBody(part)
        if (result) return result
      }
    }
    for (const part of payload.parts) {
      if (part.mimeType === 'text/html' && part.body?.data)
        return Buffer.from(part.body.data, 'base64url').toString('utf-8')
    }
  }
  return ''
}

function hdr(headers, name) {
  return headers?.find(h => h.name.toLowerCase() === name.toLowerCase())?.value ?? ''
}

async function batchFetch(ids, fetchFn, batchSize = 5, delayMs = 200) {
  const results = []
  for (let i = 0; i < ids.length; i += batchSize) {
    const batch = ids.slice(i, i + batchSize)
    const batchResults = await Promise.all(batch.map(fetchFn))
    results.push(...batchResults)
    if (i + batchSize < ids.length) await new Promise(r => setTimeout(r, delayMs))
  }
  return results
}

const [cmd, ...rawArgs] = process.argv.slice(2)

// Pull --account / -a out of the args so per-command parsers don't see it, and
// set the module-level ACCOUNT used when resolving credentials.
const args = []
for (let i = 0; i < rawArgs.length; i++) {
  const a = rawArgs[i]
  if (a === '--account' || a === '-a') ACCOUNT = rawArgs[++i]
  else if (a.startsWith('--account=')) ACCOUNT = a.slice('--account='.length)
  else args.push(a)
}

if (!cmd || cmd === '--help' || cmd === '-h') {
  console.log(`Usage: gmail.mjs <command> [--account <alias>] [options]

Credentials are stored per-account in .gmail-credentials.json and selected with
--account <alias> (or -a). You never pass secrets on the command line for normal use.
Manage stored credentials with the 'creds' command below.
(Escape hatch: GMAIL_CLIENT_ID/SECRET/REFRESH_TOKEN env vars override the store if all set.)

Account selection:
  --account, -a <alias>             Which stored account to use. Optional if a default is
                                    set or there's exactly one account.

Credential management:
  creds list                        List accounts (emails + masked fingerprints; no secrets)
  creds set <alias> [--email E] [--client-id ID] [--client-secret S] [--refresh-token T] [--default]
                                    Create/update an account (only the fields you pass change).
                                    Or pipe a JSON object on stdin with: creds set <alias> --stdin
  creds set-default <alias>         Mark an account as the default
  creds remove <alias>              Delete a stored account

Commands:
  auth-url [--account A]            Print OAuth authorization URL (client id from the account)
  auth-exchange <code> [--account A]  Exchange code; with --account, writes the refresh token
                                    straight into the store (no copying)
  token                             Print current access token
  profile                           Show authenticated user's email
  list [--query Q] [--max N] [--since ISO]  List messages (default: 10; --since filters by receipt time)
  read <msgId>                      Read a message (decoded body + headers)
  thread <threadId>                 Read all messages in a thread
  send --to ADDR --subject S --body B [--thread T] [--reply-to MSG_ID]
  draft --to ADDR --subject S --body B [--thread T] [--reply-to MSG_ID]
  send-draft <draftId>              Send an existing draft
  trash <msgId>                     Move a message to trash
  labels                            List all labels
  modify <msgId> [--add L] [--remove L]  Add/remove labels on a message`)
  process.exit(0)
}

try {
  switch (cmd) {
    case 'creds': {
      const sub = args[0]
      const store = loadCredStore()
      if (sub === 'list' || !sub) {
        const out = Object.entries(store.accounts).map(([alias, e]) => ({
          account: alias,
          email: e.email ?? null,
          default: store.default === alias,
          client_id: fingerprint(e.client_id),
          client_secret: fingerprint(e.client_secret),
          refresh_token: fingerprint(e.refresh_token),
        }))
        console.log(JSON.stringify({ accounts: out, default: store.default }, null, 2))
        break
      }
      if (sub === 'set') {
        const alias = args[1]
        if (!alias) { console.error('Usage: gmail.mjs creds set <alias> [--email E] [--client-id ID] [--client-secret S] [--refresh-token T] [--default] [--stdin]'); process.exit(1) }
        const entry = store.accounts[alias] ?? {}
        let useStdin = false, makeDefault = false
        for (let i = 2; i < args.length; i++) {
          if (args[i] === '--email') entry.email = args[++i]
          else if (args[i] === '--client-id') entry.client_id = args[++i]
          else if (args[i] === '--client-secret') entry.client_secret = args[++i]
          else if (args[i] === '--refresh-token') entry.refresh_token = args[++i]
          else if (args[i] === '--stdin') useStdin = true
          else if (args[i] === '--default') makeDefault = true
        }
        if (useStdin) {
          const blob = JSON.parse(readFileSync(0, 'utf8'))
          for (const k of ['email', 'client_id', 'client_secret', 'refresh_token']) {
            if (blob[k] != null) entry[k] = blob[k]
          }
        }
        store.accounts[alias] = entry
        if (makeDefault || store.default == null) store.default = alias
        saveCredStore(store)
        console.log(JSON.stringify({
          ok: true, account: alias, default: store.default,
          email: entry.email ?? null,
          client_id: fingerprint(entry.client_id),
          client_secret: fingerprint(entry.client_secret),
          refresh_token: fingerprint(entry.refresh_token),
        }, null, 2))
        break
      }
      if (sub === 'set-default') {
        const alias = args[1]
        if (!alias || !store.accounts[alias]) { console.error(`Unknown account '${alias}'. Available: ${Object.keys(store.accounts).join(', ') || '(none)'}`); process.exit(1) }
        store.default = alias
        saveCredStore(store)
        console.log(JSON.stringify({ ok: true, default: alias }))
        break
      }
      if (sub === 'remove' || sub === 'rm') {
        const alias = args[1]
        if (!alias || !store.accounts[alias]) { console.error(`Unknown account '${alias}'. Available: ${Object.keys(store.accounts).join(', ') || '(none)'}`); process.exit(1) }
        delete store.accounts[alias]
        if (store.default === alias) store.default = Object.keys(store.accounts)[0] ?? null
        saveCredStore(store)
        console.log(JSON.stringify({ ok: true, removed: alias, default: store.default }))
        break
      }
      console.error(`Unknown creds subcommand '${sub}'. Use: list | set | set-default | remove`)
      process.exit(1)
    }

    case 'auth-url': {
      // client id comes from the selected account's stored creds, or env override.
      let clientId = process.env.GMAIL_CLIENT_ID
      if (!clientId) {
        const { entry } = resolveAccount()
        clientId = entry.client_id
      }
      if (!clientId) {
        console.error('No client_id available. Set one with: gmail.mjs creds set <alias> --client-id ...')
        process.exit(1)
      }
      const params = new URLSearchParams({
        client_id: clientId,
        redirect_uri: REDIRECT_URI,
        response_type: 'code',
        scope: SCOPES,
        access_type: 'offline',
        prompt: 'consent',
      })
      console.log(`${AUTH_URL}?${params}`)
      break
    }

    case 'auth-exchange': {
      const code = args[0]
      if (!code) { console.error('Usage: gmail.mjs auth-exchange <code> [--account <alias>]'); process.exit(1) }
      // Pull client id/secret from the account store (preferred) or env.
      let clientId = process.env.GMAIL_CLIENT_ID
      let clientSecret = process.env.GMAIL_CLIENT_SECRET
      let storeAcct = null
      if (!clientId || !clientSecret) {
        const { acct, entry } = resolveAccount()
        storeAcct = acct
        clientId = clientId || entry.client_id
        clientSecret = clientSecret || entry.client_secret
      }
      if (!clientId || !clientSecret) {
        console.error('client_id and client_secret required (set them on the account first, or pass via env).')
        process.exit(1)
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
      cache[clientId] = { access_token: data.access_token, expiry: Date.now() + data.expires_in * 1000 }
      saveTokenCache(cache)
      // If an account was selected, write the refresh token straight into the store
      // so it never has to be copied by hand.
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

    case 'profile': {
      const data = await gmailFetch('/profile')
      console.log(JSON.stringify(data, null, 2))
      break
    }

    case 'list': {
      const params = new URLSearchParams()
      let max = 10
      let query = ''
      let sinceMs = null
      for (let i = 0; i < args.length; i++) {
        if (args[i] === '--query' || args[i] === '-q') query = args[++i]
        else if (args[i] === '--max' || args[i] === '-n') max = parseInt(args[++i])
        else if (args[i] === '--label') params.set('labelIds', args[++i])
        else if (args[i] === '--since') {
          const raw = args[++i]
          const t = Date.parse(raw)
          if (Number.isNaN(t)) { console.error(`Invalid --since value: "${raw}"`); process.exit(1) }
          sinceMs = t
          // Narrow server-side. Gmail's after: operator is only day-precise,
          // so this is a coarse prefilter; the exact cutoff is enforced below.
          query = `${query} after:${Math.floor(t / 1000)}`.trim()
        }
      }
      if (query) params.set('q', query)
      params.set('maxResults', String(max))
      const listData = await gmailFetch(`/messages?${params}`)
      if (!listData?.messages?.length) {
        console.log(JSON.stringify({ messages: [], resultSizeEstimate: 0 }))
        break
      }
      let messages = await batchFetch(listData.messages, async m => {
        const msg = await gmailFetch(
          `/messages/${m.id}?format=metadata&metadataHeaders=From&metadataHeaders=Subject&metadataHeaders=Date`
        )
        return {
          id: msg.id,
          threadId: msg.threadId,
          from: hdr(msg.payload?.headers, 'From'),
          subject: hdr(msg.payload?.headers, 'Subject'),
          date: hdr(msg.payload?.headers, 'Date'),
          internalDate: msg.internalDate,
          snippet: msg.snippet,
          labels: msg.labelIds,
        }
      })
      // Exact --since cutoff. Gmail's after: operator is only day-precise and
      // keys off the Date header, which can drift from the real receipt time.
      // internalDate is Gmail's authoritative receipt timestamp (epoch ms).
      if (sinceMs !== null) {
        messages = messages.filter(m => Number(m.internalDate) >= sinceMs)
      }
      console.log(JSON.stringify({
        messages,
        resultSizeEstimate: sinceMs !== null ? messages.length : listData.resultSizeEstimate,
      }, null, 2))
      break
    }

    case 'read': {
      const id = args[0]
      if (!id) { console.error('Usage: gmail.mjs read <msgId>'); process.exit(1) }
      const msg = await gmailFetch(`/messages/${id}?format=full`)
      const headers = msg.payload?.headers ?? []
      console.log(JSON.stringify({
        id: msg.id,
        threadId: msg.threadId,
        from: hdr(headers, 'From'),
        to: hdr(headers, 'To'),
        cc: hdr(headers, 'Cc'),
        subject: hdr(headers, 'Subject'),
        date: hdr(headers, 'Date'),
        messageId: hdr(headers, 'Message-ID'),
        labels: msg.labelIds,
        body: extractBody(msg.payload),
      }, null, 2))
      break
    }

    case 'send': {
      let to = '', subject = '', body = '', threadId = '', replyTo = ''
      for (let i = 0; i < args.length; i++) {
        if (args[i] === '--to') to = args[++i]
        else if (args[i] === '--subject') subject = args[++i]
        else if (args[i] === '--body') body = args[++i]
        else if (args[i] === '--thread') threadId = args[++i]
        else if (args[i] === '--reply-to') replyTo = args[++i]
      }
      if (!to || !subject || !body) {
        console.error('Usage: gmail.mjs send --to ADDR --subject S --body B [--thread T] [--reply-to MSG_ID]')
        process.exit(1)
      }
      const lines = [`To: ${to}`, `Subject: ${subject}`, 'Content-Type: text/plain; charset=utf-8', 'MIME-Version: 1.0']
      if (replyTo) {
        lines.push(`In-Reply-To: ${replyTo}`, `References: ${replyTo}`)
      }
      lines.push('', body)
      const raw = Buffer.from(lines.join('\r\n')).toString('base64url')
      const payload = { raw }
      if (threadId) payload.threadId = threadId
      const result = await gmailFetch('/messages/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      console.log(JSON.stringify(result, null, 2))
      break
    }

    case 'labels': {
      const data = await gmailFetch('/labels')
      console.log(JSON.stringify(
        data.labels.map(l => ({ id: l.id, name: l.name, type: l.type })),
        null, 2
      ))
      break
    }

    case 'thread': {
      const id = args[0]
      if (!id) { console.error('Usage: gmail.mjs thread <threadId>'); process.exit(1) }
      const data = await gmailFetch(`/threads/${id}?format=full`)
      const messages = (data.messages ?? []).map(msg => {
        const headers = msg.payload?.headers ?? []
        return {
          id: msg.id,
          from: hdr(headers, 'From'),
          to: hdr(headers, 'To'),
          date: hdr(headers, 'Date'),
          subject: hdr(headers, 'Subject'),
          labels: msg.labelIds,
          body: extractBody(msg.payload),
        }
      })
      console.log(JSON.stringify({ threadId: data.id, messages }, null, 2))
      break
    }

    case 'draft': {
      let to = '', subject = '', body = '', threadId = '', replyTo = ''
      for (let i = 0; i < args.length; i++) {
        if (args[i] === '--to') to = args[++i]
        else if (args[i] === '--subject') subject = args[++i]
        else if (args[i] === '--body') body = args[++i]
        else if (args[i] === '--thread') threadId = args[++i]
        else if (args[i] === '--reply-to') replyTo = args[++i]
      }
      if (!to || !subject || !body) {
        console.error('Usage: gmail.mjs draft --to ADDR --subject S --body B [--thread T] [--reply-to MSG_ID]')
        process.exit(1)
      }
      const lines = [`To: ${to}`, `Subject: ${subject}`, 'Content-Type: text/plain; charset=utf-8', 'MIME-Version: 1.0']
      if (replyTo) {
        lines.push(`In-Reply-To: ${replyTo}`, `References: ${replyTo}`)
      }
      lines.push('', body)
      const raw = Buffer.from(lines.join('\r\n')).toString('base64url')
      const message = { raw }
      if (threadId) message.threadId = threadId
      const result = await gmailFetch('/drafts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message }),
      })
      console.log(JSON.stringify({ id: result.id, messageId: result.message?.id, threadId: result.message?.threadId }, null, 2))
      break
    }

    case 'send-draft': {
      const id = args[0]
      if (!id) { console.error('Usage: gmail.mjs send-draft <draftId>'); process.exit(1) }
      const result = await gmailFetch('/drafts/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      })
      console.log(JSON.stringify(result, null, 2))
      break
    }

    case 'trash': {
      const id = args[0]
      if (!id) { console.error('Usage: gmail.mjs trash <msgId>'); process.exit(1) }
      await gmailFetch(`/messages/${id}/trash`, { method: 'POST' })
      console.log(JSON.stringify({ ok: true, trashed: id }))
      break
    }

    case 'modify': {
      const id = args[0]
      if (!id) { console.error('Usage: gmail.mjs modify <msgId> [--add L] [--remove L]'); process.exit(1) }
      const addLabels = [], removeLabels = []
      for (let i = 1; i < args.length; i++) {
        if (args[i] === '--add') addLabels.push(args[++i])
        else if (args[i] === '--remove') removeLabels.push(args[++i])
      }
      const result = await gmailFetch(`/messages/${i}/modify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ addLabelIds: addLabels, removeLabelIds: removeLabels }),
      })
      console.log(JSON.stringify({ ok: true, labels: result.labelIds }, null, 2))
      break
    }

    default:
      console.error(`Unknown command: ${cmd}. Run gmail.mjs --help`)
      process.exit(1)
  }
} catch (err) {
  console.error(JSON.stringify({ error: err.message }))
  process.exit(1)
}
