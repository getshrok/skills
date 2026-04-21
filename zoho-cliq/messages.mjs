#!/usr/bin/env node
// messages.mjs — Fetch messages from a Zoho Cliq chat.
// Usage: node messages.mjs [--chat-id <id>] [--limit N] [--before <messageId>] [--help]

import { parseArgs } from 'node:util'
import { EXIT, getAccessToken, cliqGet } from './_shared.mjs'

const { values } = parseArgs({
  options: {
    'chat-id': { type: 'string' },
    limit:     { type: 'string', default: '20' },
    before:    { type: 'string' },
    help:      { type: 'boolean' },
  },
  strict: true,
})

if (values.help) {
  console.log(`Usage: node messages.mjs [--chat-id <id>] [--limit N] [--before <messageId>] [--help]

Fetches messages from a Zoho Cliq chat.
  --chat-id     Chat ID (defaults to ZOHO_CLIQ_CHAT_ID env var)
  --limit N     Max messages to return (default: 20)
  --before      Message ID for pagination (returns older messages)

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

const data = await cliqGet(`/chats/${chatId}/messages?${params}`, token)

// Channels return { data: [...] } with ms timestamps and content.text
// DM chats return { messages: [...] } with ISO timestamps and text directly
const raw = data.data ?? data.messages ?? []
const messages = raw.map(m => ({
  message_id: m.id ?? m.message_id,
  sender:     m.sender?.name ?? m.sender_id ?? 'unknown',
  time:       typeof m.time === 'number' ? new Date(m.time).toISOString() : m.time,
  text:       m.content?.text ?? m.text ?? '',
  type:       m.type ?? 'text',
}))
console.log(JSON.stringify(messages, null, 2))
