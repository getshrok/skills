#!/usr/bin/env node
// messages.mjs — Fetch messages from a Zoho Cliq chat.
// Usage: node messages.mjs [--chat-id <id>] [--limit N] [--before <messageId>] [--since <date>] [--help]

import { parseArgs } from 'node:util'
import { EXIT, getAccessToken, cliqGet, parseDateArg, toLocalISO } from './_shared.mjs'

const { values } = parseArgs({
  options: {
    'chat-id': { type: 'string' },
    limit:     { type: 'string', default: '20' },
    before:    { type: 'string' },
    since:     { type: 'string' },
    help:      { type: 'boolean' },
  },
  strict: true,
})

if (values.help) {
  console.log(`Usage: node messages.mjs [--chat-id <id>] [--limit N] [--before <messageId>] [--since <date>] [--help]

Fetches messages from a Zoho Cliq chat.
  --chat-id     Chat ID (defaults to ZOHO_CLIQ_CHAT_ID env var)
  --limit N     Max messages to return (default: 20)
  --before      Message ID for pagination (returns older messages)
  --since       Only return messages newer than this. Accepts ISO 8601 (local
                timezone if no offset given), "today", "yesterday", "next
                <weekday>", or "N days/weeks/months ago".

Timestamps in the output use ISO 8601 with the local timezone offset.

Exit codes: 0 success, 1 usage, 2 auth, 3 connection, 4 not found`)
  process.exit(EXIT.OK)
}

const chatId = values['chat-id'] ?? process.env.ZOHO_CLIQ_CHAT_ID
if (!chatId) {
  console.error('--chat-id is required (or set ZOHO_CLIQ_CHAT_ID)')
  process.exit(EXIT.USAGE)
}

const token = await getAccessToken()
const params = new URLSearchParams({ limit: String(parseInt(values.limit, 10) || 20) })
if (values.before) params.set('before', values.before)

const since = values.since ? parseDateArg(values.since) : null

const data = await cliqGet(`/chats/${chatId}/messages?${params}`, token)

// Channels return { data: [...] } with ms timestamps and content.text
// DM chats return { messages: [...] } with ISO timestamps and text directly
const raw = data.data ?? data.messages ?? []
let messages = raw.map(m => {
  const t = typeof m.time === 'number' ? new Date(m.time) : new Date(m.time)
  return {
    message_id: m.id ?? m.message_id,
    sender:     m.sender?.name ?? m.sender_id ?? 'unknown',
    time:       toLocalISO(t),
    _t:         t,
    text:       m.content?.text ?? m.text ?? '',
    type:       m.type ?? 'text',
  }
})
if (since) messages = messages.filter(m => m._t > since)
messages = messages.map(({ _t, ...rest }) => rest)
console.log(JSON.stringify(messages, null, 2))
