#!/usr/bin/env node
// search.mjs — Search all Zoho Mail messages including archived.
// Usage: node search.mjs --query <text> [--limit <n>] [--since <date>]

import { parseArgs } from 'node:util'
import { EXIT, getAccessToken, zohoGet, parseDateArg, toLocalISO } from './_shared.mjs'

const { values } = parseArgs({
  options: {
    query:  { type: 'string' },
    limit:  { type: 'string', default: '20' },
    since:  { type: 'string' },
    help:   { type: 'boolean' },
  },
  strict: true,
})

if (values.help || !values.query) {
  console.log(`Usage: node search.mjs --query <text> [--limit N] [--since <date>] [--help]

Full-text search across Zoho Mail (includes archived messages, unlike read.mjs).
  --query   Search text (required)
  --limit   Max results (default: 20)
  --since   Only return messages since this time. Accepts ISO 8601
            (local timezone if no offset given), "today", "yesterday",
            "next <weekday>", or "N days/weeks/months ago".

Timestamps in the output use ISO 8601 with the local timezone offset.

Exit codes: 0 success, 1 usage, 2 auth, 3 connection`)
  process.exit(values.help ? EXIT.OK : EXIT.USAGE)
}

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
  date:     toLocalISO(new Date(parseInt(m.receivedTime))),
  snippet:  m.summary ?? '',
  unread:   !m.isRead,
}))

console.log(JSON.stringify(out, null, 2))
