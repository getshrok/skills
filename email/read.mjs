#!/usr/bin/env node
// read.mjs — Fetch messages from an IMAP folder with optional filters.
// Usage: node read.mjs [--folder INBOX] [--unread] [--limit 20] [--since <date>] [--from <addr>] [--subject <text>]

import { parseArgs } from 'node:util'
import { parseDateArg, makeClient, EXIT } from './_shared.mjs'

const { values } = parseArgs({
  options: {
    folder:  { type: 'string', default: 'INBOX' },
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

const client = makeClient()

try {
  await client.connect()
  await client.mailboxOpen(values.folder)

  const searchCriteria = []
  if (values.unread) searchCriteria.push('UNSEEN')
  if (values.since)  searchCriteria.push(['SINCE', parseDateArg(values.since)])
  if (values.from)   searchCriteria.push(['FROM', values.from])
  if (values.subject) searchCriteria.push(['SUBJECT', values.subject])
  if (searchCriteria.length === 0) searchCriteria.push('ALL')

  const uids = await client.search(searchCriteria.length === 1 ? searchCriteria[0] : searchCriteria, { uid: true })
  const sliced = uids.slice(-limit)

  const messages = []
  if (sliced.length > 0) {
    for await (const msg of client.fetch(sliced.join(','), {
      uid: true, flags: true, envelope: true, bodyStructure: true,
    }, { uid: true })) {
      messages.push({
        id:      String(msg.uid),
        folder:  values.folder,
        from:    msg.envelope.from?.[0]?.address ?? '',
        to:      (msg.envelope.to ?? []).map(a => a.address),
        subject: msg.envelope.subject ?? '',
        date:    msg.envelope.date?.toISOString() ?? '',
        snippet: '',
        flags:   [...(msg.flags ?? [])],
      })
    }

    // Fetch snippets separately (first 200 chars of plain text body)
    for (const m of messages) {
      try {
        const fetched = await client.fetchOne(m.id, { bodyParts: ['TEXT'] }, { uid: true })
        const text = fetched.bodyParts?.get('TEXT')?.toString('utf8') ?? ''
        m.snippet = text.replace(/\s+/g, ' ').trim().slice(0, 200)
      } catch { /* snippet is best-effort */ }
    }
  }

  console.log(JSON.stringify(messages))
} catch (err) {
  console.error(err.message)
  process.exit(err.authenticationFailed ? EXIT.AUTH : EXIT.CONNECTION)
} finally {
  await client.logout().catch(() => {})
}
