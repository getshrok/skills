#!/usr/bin/env node
// read.mjs — Fetch recent messages using Zoho search.
// Uses search API (folder listing endpoint is not available in this API scope).
// Usage: node read.mjs [--folder <name>] [--unread] [--limit <n>] [--since <date>]
//                      [--from <address>] [--subject <text>]

import { parseArgs } from 'node:util'
import { EXIT, getAccessToken, zohoGet, parseDateArg } from './_shared.mjs'

const { values } = parseArgs({
  options: {
    folder:  { type: 'string' },
    unread:  { type: 'boolean', default: false },
    limit:   { type: 'string', default: '20' },
    since:   { type: 'string' },
    from:    { type: 'string' },
    subject: { type: 'string' },
  },
  strict: true,
})

const limit = parseInt(values.limit, 10)
if (isNaN(limit) || limit < 1) { console.error('--limit must be a positive integer'); process.exit(EXIT.USAGE) }

const token = await getAccessToken()

// Build a Zoho search query from the filters.
// Zoho search syntax: in:folder, from:addr, subject:text, entire:keyword, is:unread, has:attachment
const parts = []
if (values.folder)  parts.push(`in:${values.folder}`)
if (values.from)    parts.push(`from:${values.from}`)
if (values.subject) parts.push(`subject:${values.subject}`)
if (values.unread)  parts.push('is:unread')

// Default to inbox if no folder specified
if (!values.folder) parts.push('in:inbox')

const searchKey = parts.join(' ')
const params = new URLSearchParams({
  searchKey,
  limit: String(Math.min(limit, 200)),
  start: '0',
})
if (values.since) {
  const d = parseDateArg(values.since)
  params.set('receivedTime', String(d.getTime()))
}

const data = await zohoGet(`/messages/search?${params}`, token)
const messages = (data.data ?? []).slice(0, limit)

const out = messages.map(m => ({
  id:       m.messageId,
  folderId: m.folderId,
  from:     m.fromAddress,
  to:       m.toAddress ? m.toAddress.split(',').map(a => a.trim().replace(/&lt;/g,'<').replace(/&gt;/g,'>')) : [],
  subject:  m.subject ?? '(no subject)',
  date:     new Date(parseInt(m.receivedTime)).toISOString(),
  snippet:  m.summary ?? '',
  unread:   !m.isRead,
}))

console.log(JSON.stringify(out, null, 2))
