#!/usr/bin/env node
// unread.mjs — Fetch messages across all Cliq chats and channels since a given time.
// Usage: node unread.mjs --since <ISO> [--limit N] [--help]

import { parseArgs } from 'node:util'
import { EXIT, getAccessToken, cliqGet } from './_shared.mjs'

const { values } = parseArgs({
  options: {
    since: { type: 'string' },
    limit: { type: 'string', default: '50' },
    help:  { type: 'boolean' },
  },
  strict: true,
})

if (values.help || !values.since) {
  console.log(`Usage: node unread.mjs --since <ISO> [--limit N] [--help]

Fetches messages across all Cliq chats and channels newer than the given timestamp.
  --since   ISO timestamp to check from (required)
  --limit   Max conversations to scan per type (default: 50)

Returns messages grouped by conversation. Empty array if nothing new.
The calling skill is responsible for tracking lastChecked in its own MEMORY.md.

Exit codes: 0 success, 1 usage, 2 auth, 3 connection`)
  process.exit(values.help ? EXIT.OK : EXIT.USAGE)
}

const since = new Date(values.since)
if (isNaN(since.getTime())) {
  console.error(`Invalid --since value: "${values.since}"`)
  process.exit(EXIT.USAGE)
}

const limit = String(parseInt(values.limit, 10) || 50)
const token = await getAccessToken()

const [chatsData, channelsData] = await Promise.all([
  cliqGet(`/chats?limit=${limit}`, token),
  cliqGet(`/channels?limit=${limit}`, token),
])

// Chats: filter by last_modified_time > since (API has no unread flag for chats)
const activeChats = (chatsData.chats ?? []).filter(c => {
  const t = c.last_modified_time ? new Date(c.last_modified_time) : null
  return t && t > since
})

// Channels: use unread_count > 0 (API exposes this reliably for channels)
const unreadChannels = (channelsData.channels ?? []).filter(c => (c.unread_count ?? 0) > 0)

const toFetch = [
  ...activeChats.map(c => ({ chat_id: c.chat_id, name: c.name, type: c.chat_type, msgLimit: 10 })),
  ...unreadChannels.map(c => ({ chat_id: c.chat_id, name: c.name, type: 'channel', msgLimit: Math.min(c.unread_count, 20) })),
]

if (toFetch.length === 0) {
  console.log(JSON.stringify([]))
  process.exit(EXIT.OK)
}

const results = await Promise.all(
  toFetch.map(async conv => {
    const data = await cliqGet(`/chats/${conv.chat_id}/messages?limit=${conv.msgLimit}`, token)
    const raw = data.data ?? data.messages ?? []
    const messages = raw
      .map(m => ({
        message_id: m.id ?? m.message_id,
        sender:     m.sender?.name ?? m.sender_id ?? 'unknown',
        time:       typeof m.time === 'number' ? new Date(m.time).toISOString() : m.time,
        text:       m.content?.text ?? m.text ?? '',
        type:       m.type ?? 'text',
      }))
      .filter(m => new Date(m.time) > since)
    return { chat_id: conv.chat_id, name: conv.name, type: conv.type, messages }
  })
)

console.log(JSON.stringify(results.filter(r => r.messages.length > 0), null, 2))
process.exit(EXIT.OK)
