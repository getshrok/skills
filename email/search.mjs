#!/usr/bin/env node
// search.mjs — Search messages using IMAP SEARCH (server-side, may span folders).
// Usage: node search.mjs [--query <text>] [--folder <name>] [--limit 20] [--since <date>]

import { parseArgs } from 'node:util'
import { parseDateArg, makeClient, EXIT } from './_shared.mjs'

const { values } = parseArgs({
  options: {
    query:  { type: 'string' },
    folder: { type: 'string' },
    limit:  { type: 'string', default: '20' },
    since:  { type: 'string' },
  },
  strict: true,
})

const limit = parseInt(values.limit, 10)
if (isNaN(limit) || limit < 1) { console.error('--limit must be a positive integer'); process.exit(EXIT.USAGE) }

const client = makeClient()

async function searchFolder(folderName) {
  await client.mailboxOpen(folderName)

  const searchCriteria = []
  if (values.since) searchCriteria.push(['SINCE', parseDateArg(values.since)])
  if (values.query) searchCriteria.push(['TEXT', values.query])
  if (searchCriteria.length === 0) searchCriteria.push('ALL')

  const uids = await client.search(searchCriteria.length === 1 ? searchCriteria[0] : searchCriteria, { uid: true })
  const sliced = uids.slice(-limit)

  const messages = []
  if (sliced.length > 0) {
    for await (const msg of client.fetch(sliced.join(','), {
      uid: true, flags: true, envelope: true,
    }, { uid: true })) {
      messages.push({
        id:      String(msg.uid),
        folder:  folderName,
        from:    msg.envelope.from?.[0]?.address ?? '',
        to:      (msg.envelope.to ?? []).map(a => a.address),
        subject: msg.envelope.subject ?? '',
        date:    msg.envelope.date?.toISOString() ?? '',
        snippet: '',
        flags:   [...(msg.flags ?? [])],
      })
    }
  }
  return messages
}

try {
  await client.connect()

  let results = []
  if (values.folder) {
    results = await searchFolder(values.folder)
  } else {
    // Search all subscribable folders
    const folders = await client.list()
    for (const folder of folders) {
      if (folder.flags?.has('\\Noselect')) continue
      try {
        const found = await searchFolder(folder.path)
        results.push(...found)
        if (results.length >= limit) break
      } catch { /* skip inaccessible folders */ }
    }
    results = results.slice(0, limit)
  }

  console.log(JSON.stringify(results))
} catch (err) {
  console.error(err.message)
  process.exit(err.authenticationFailed ? EXIT.AUTH : EXIT.CONNECTION)
} finally {
  await client.logout().catch(() => {})
}
