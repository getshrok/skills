#!/usr/bin/env node
// search.mjs — Search all Zoho Mail messages including archived.
// Usage: node search.mjs --query <text> [--limit <n>] [--since <date>]

import { parseArgs } from 'node:util'
import { EXIT, getAccessToken, zohoGet, parseDateArg } from './_shared.mjs'

const { values } = parseArgs({
  options: {
    query:  { type: 'string' },
    limit:  { type: 'string', default: '20' },
    since:  { type: 'string' },
  },
  strict: true,
})

if (!values.query) { console.error('--query is required'); process.exit(EXIT.USAGE) }

const limit = parseInt(values.limit, 10)
if (isNaN(limit) || limit < 1) { console.error('--limit must be a positive integer'); process.exit(EXIT.USAGE) }

const token = await getAccessToken()

// Zoho search uses its own syntax: entire:keyword, subject:text, from:email, etc.
// Prefix with "entire:" if the query doesn't already use a Zoho keyword prefix.
const zohoKey = /^\w+:/.test(values.query) ? values.query : `entire:${values.query}`
const params = new URLSearchParams({
  searchKey: zohoKey,
  limit:     String(Math.min(limit, 200)),
  start:     '0',
})
if (values.since) {
  const d = parseDateArg(values.since)
  params.set('receivedTime', String(d.getTime()))
}

const data = await zohoGet(`/messages/search?${params}`, token)
let messages = data.data ?? []
messages = messages.slice(0, limit)

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
