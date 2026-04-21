#!/usr/bin/env node
// chats.mjs — List Zoho Cliq conversations.
// Usage: node chats.mjs [--limit N] [--type dm|channel] [--help]

import { parseArgs } from 'node:util'
import { EXIT, getAccessToken, cliqGet } from './_shared.mjs'

const { values } = parseArgs({
  options: {
    limit: { type: 'string', default: '20' },
    type:  { type: 'string' },
    help:  { type: 'boolean' },
  },
  strict: true,
})

if (values.help) {
  console.log(`Usage: node chats.mjs [--limit N] [--type dm|channel] [--help]

Lists Zoho Cliq conversations (DMs and channels).
  --limit N     Max results (default: 20)
  --type        Filter by type: dm or channel

Exit codes: 0 success, 1 usage, 2 auth, 3 connection`)
  process.exit(EXIT.OK)
}

const token = await getAccessToken()
const params = new URLSearchParams({ limit: String(parseInt(values.limit, 10) || 20) })
if (values.type) params.set('type', values.type)

const data = await cliqGet(`/chats?${params}`, token)
const chats = (data.chats ?? []).map(c => ({
  chat_id:       c.chat_id,
  name:          c.name,
  type:          c.chat_type,
  unread:        c.unread_count ?? 0,
  last_modified: c.last_modified_time,
}))
console.log(JSON.stringify(chats, null, 2))
