#!/usr/bin/env node

import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const SKILL_DIR = import.meta.dirname
const TOKEN_CACHE = join(SKILL_DIR, '.token-cache')
const GMAIL_API = 'https://gmail.googleapis.com/gmail/v1/users/me'
const TOKEN_URL = 'https://oauth2.googleapis.com/token'
const AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth'
const SCOPES = 'https://mail.google.com/'
const REDIRECT_URI = 'http://localhost'

// Credentials must be supplied as environment variables at invocation time.
// See MEMORY.md for the values to use for each account.
function requireCredentials() {
  const missing = ['GMAIL_CLIENT_ID', 'GMAIL_CLIENT_SECRET', 'GMAIL_REFRESH_TOKEN']
    .filter(k => !process.env[k])
  if (missing.length) {
    throw new Error(
      `Missing required environment variable(s): ${missing.join(', ')}\n` +
      `Set them at invocation time, e.g.:\n` +
      `  GMAIL_CLIENT_ID=... GMAIL_CLIENT_SECRET=... GMAIL_REFRESH_TOKEN=... node gmail.mjs <command>\n` +
      `See MEMORY.md for credential values for each account.`
    )
  }
  return {
    clientId:     process.env.GMAIL_CLIENT_ID,
    clientSecret: process.env.GMAIL_CLIENT_SECRET,
    refreshToken: process.env.GMAIL_REFRESH_TOKEN,
  }
}

// Token cache is keyed by client ID so multiple accounts don't collide.
function loadTokenCache() {
  try { return JSON.parse(readFileSync(TOKEN_CACHE, 'utf8')) } catch { return {} }
}

function saveTokenCache(cache) {
  writeFileSync(TOKEN_CACHE, JSON.stringify(cache))
}

async function getAccessToken() {
  const { clientId, clientSecret, refreshToken } = requireCredentials()
  // Return cached token if not expired (60s buffer), keyed by client ID
  const cache = loadTokenCache()
  const entry = cache[clientId]
  if (entry?.access_token && entry?.expiry && Date.now() < entry.expiry - 60_000) {
    return entry.access_token
  }
  // Refresh
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

const [cmd, ...args] = process.argv.slice(2)

if (!cmd || cmd === '--help' || cmd === '-h') {
  console.log(`Usage: gmail.mjs <command> [options]

Credentials must be supplied as environment variables at invocation time (see MEMORY.md):
  GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET, GMAIL_REFRESH_TOKEN

Commands:
  auth-url                          Print OAuth authorization URL
  auth-exchange <code>              Exchange authorization code, print refresh token
  token                             Print current access token
  profile                           Show authenticated user's email
  list [--query Q] [--max N]        List messages (default: 10)
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
    case 'auth-url': {
      const clientId = process.env.GMAIL_CLIENT_ID
      if (!clientId) {
        console.error('GMAIL_CLIENT_ID environment variable is required for auth-url.')
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
      if (!code) { console.error('Usage: gmail.mjs auth-exchange <code>'); process.exit(1) }
      const clientId     = process.env.GMAIL_CLIENT_ID
      const clientSecret = process.env.GMAIL_CLIENT_SECRET
      if (!clientId || !clientSecret) {
        console.error('GMAIL_CLIENT_ID and GMAIL_CLIENT_SECRET environment variables are required for auth-exchange.')
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
      // Cache the access token keyed by client ID
      const cache = loadTokenCache()
      cache[clientId] = { access_token: data.access_token, expiry: Date.now() + data.expires_in * 1000 }
      saveTokenCache(cache)
      console.log(JSON.stringify({ ok: true, refresh_token: data.refresh_token, scope: data.scope }))
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
      for (let i = 0; i < args.length; i++) {
        if (args[i] === '--query' || args[i] === '-q') params.set('q', args[++i])
        else if (args[i] === '--max' || args[i] === '-n') max = parseInt(args[++i])
        else if (args[i] === '--label') params.set('labelIds', args[++i])
      }
      params.set('maxResults', String(max))
      const listData = await gmailFetch(`/messages?${params}`)
      if (!listData?.messages?.length) {
        console.log(JSON.stringify({ messages: [], resultSizeEstimate: 0 }))
        break
      }
      // Fetch metadata for each
      const messages = await Promise.all(
        listData.messages.map(async m => {
          const msg = await gmailFetch(
            `/messages/${m.id}?format=metadata&metadataHeaders=From&metadataHeaders=Subject&metadataHeaders=Date`
          )
          return {
            id: msg.id,
            threadId: msg.threadId,
            from: hdr(msg.payload?.headers, 'From'),
            subject: hdr(msg.payload?.headers, 'Subject'),
            date: hdr(msg.payload?.headers, 'Date'),
            snippet: msg.snippet,
            labels: msg.labelIds,
          }
        })
      )
      console.log(JSON.stringify({ messages, resultSizeEstimate: listData.resultSizeEstimate }, null, 2))
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
      const result = await gmailFetch(`/messages/${id}/modify`, {
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
