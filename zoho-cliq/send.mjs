#!/usr/bin/env node
// send.mjs — Send a message to a Zoho Cliq chat.
// Usage: node send.mjs --text <message> [--chat-id <id>] [--help]

import { parseArgs } from 'node:util'
import { EXIT, getAccessToken, cliqPost } from './_shared.mjs'

const { values } = parseArgs({
  options: {
    'chat-id': { type: 'string' },
    text:      { type: 'string' },
    help:      { type: 'boolean' },
  },
  strict: true,
})

if (values.help) {
  console.log(`Usage: node send.mjs --text <message> [--chat-id <id>] [--help]

Sends a message to a Zoho Cliq chat.
  --text        Message text (required)
  --chat-id     Chat ID (defaults to ZOHO_CLIQ_CHAT_ID env var)

Exit codes: 0 success, 1 usage, 2 auth, 3 connection`)
  process.exit(EXIT.OK)
}

if (!values.text) { console.error('--text is required'); process.exit(EXIT.USAGE) }

const chatId = values['chat-id'] ?? process.env.ZOHO_CLIQ_CHAT_ID
if (!chatId) {
  console.error('--chat-id is required (or set ZOHO_CLIQ_CHAT_ID)')
  process.exit(EXIT.USAGE)
}

const token = await getAccessToken()
const data = await cliqPost(`/chats/${chatId}/message`, token, { text: values.text })
console.log(JSON.stringify({ ok: true, message_id: data.message_id ?? null }))
