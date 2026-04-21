#!/usr/bin/env node
// message.mjs — Fetch full message content by IMAP UID.
// Usage: node message.mjs --id <uid> [--folder INBOX] [--save-attachments <dir>]

import * as fs from 'node:fs'
import * as path from 'node:path'
import { parseArgs } from 'node:util'
import { makeClient, EXIT } from './_shared.mjs'

const { values } = parseArgs({
  options: {
    id:                 { type: 'string' },
    folder:             { type: 'string', default: 'INBOX' },
    'save-attachments': { type: 'string' },
  },
  strict: true,
})

if (!values.id) { console.error('--id is required'); process.exit(EXIT.USAGE) }

/**
 * Walk an imapflow bodyStructure tree to find the IMAP part numbers for the
 * first text/plain and text/html parts. At the root level, multipart children
 * are numbered 1, 2, 3; nested children use dotted notation (1.1, 1.2, etc.).
 */
function findTextParts(part, depth = 0, partNum = '1') {
  if (!part) return {}
  if (part.type === 'text') {
    return {
      plain: part.subtype === 'plain' ? partNum : undefined,
      html:  part.subtype === 'html'  ? partNum : undefined,
    }
  }
  if (part.type === 'multipart' && part.childNodes) {
    let plain, html
    part.childNodes.forEach((child, i) => {
      const childNum = depth === 0 ? String(i + 1) : `${partNum}.${i + 1}`
      const found = findTextParts(child, depth + 1, childNum)
      if (!plain && found.plain) plain = found.plain
      if (!html  && found.html)  html  = found.html
    })
    return { plain, html }
  }
  return {}
}

const client = makeClient()

try {
  await client.connect()
  await client.mailboxOpen(values.folder)

  // Single fetch: metadata + body structure + raw source (for header extraction)
  const msg = await client.fetchOne(values.id, {
    uid: true, flags: true, envelope: true, bodyStructure: true, source: true,
  }, { uid: true })

  if (!msg) { console.error(`Message ${values.id} not found in ${values.folder}`); process.exit(EXIT.NOT_FOUND) }

  // Extract headers from raw source
  const raw = msg.source.toString('utf8')
  const headerEnd = raw.indexOf('\r\n\r\n')
  const headerBlock = headerEnd >= 0 ? raw.slice(0, headerEnd) : raw
  const headers = {}
  for (const line of headerBlock.split('\r\n')) {
    const colon = line.indexOf(':')
    if (colon > 0) {
      const key = line.slice(0, colon).toLowerCase().trim()
      const val = line.slice(colon + 1).trim()
      headers[key] = val
    }
  }

  // Use body structure to find exact part numbers for plain and html
  const { plain: plainPart, html: htmlPart } = findTextParts(msg.bodyStructure)
  const wantedParts = [plainPart, htmlPart].filter(Boolean)
  let plain = '', html = ''
  if (wantedParts.length) {
    const bodyMsg = await client.fetchOne(values.id, { bodyParts: wantedParts }, { uid: true })
    if (plainPart) plain = bodyMsg?.bodyParts?.get(plainPart)?.toString('utf8') ?? ''
    if (htmlPart)  html  = bodyMsg?.bodyParts?.get(htmlPart)?.toString('utf8')  ?? ''
  }

  // Collect attachments from already-fetched body structure
  const attachments = []
  function collectAttachments(part, partNum) {
    if (!part) return
    if (part.disposition === 'attachment' || part.filename) {
      const att = {
        filename: part.filename ?? `attachment-${partNum}`,
        mimeType: `${part.type}/${part.subtype}`,
        size: part.size ?? 0,
      }
      if (values['save-attachments']) {
        try {
          fs.mkdirSync(values['save-attachments'], { recursive: true })
          att._partNum = partNum
        } catch { /* ignore */ }
      }
      attachments.push(att)
    }
    if (part.childNodes) {
      part.childNodes.forEach((child, i) => collectAttachments(child, `${partNum}.${i + 1}`))
    }
  }
  if (msg.bodyStructure) collectAttachments(msg.bodyStructure, '1')

  // Download attachments if requested
  if (values['save-attachments'] && attachments.length > 0) {
    for (const att of attachments) {
      if (!att._partNum) continue
      try {
        const fetched = await client.fetchOne(values.id, { bodyParts: [att._partNum] }, { uid: true })
        const data = fetched?.bodyParts?.get(att._partNum)
        if (data) {
          const dest = path.join(values['save-attachments'], att.filename)
          fs.writeFileSync(dest, data)
          att.saved = dest
        }
      } catch { /* skip unsaveable attachments */ }
      delete att._partNum
    }
  } else {
    for (const att of attachments) delete att._partNum
  }

  console.log(JSON.stringify({
    id:      String(msg.uid),
    folder:  values.folder,
    from:    msg.envelope.from?.[0]?.address ?? '',
    to:      (msg.envelope.to ?? []).map(a => a.address),
    cc:      (msg.envelope.cc ?? []).map(a => a.address),
    subject: msg.envelope.subject ?? '',
    date:    msg.envelope.date?.toISOString() ?? '',
    headers: {
      'message-id':  headers['message-id'] ?? '',
      'in-reply-to': headers['in-reply-to'] ?? '',
      'references':  headers['references'] ?? '',
    },
    body: { plain, html },
    attachments,
  }))
} catch (err) {
  console.error(err.message)
  process.exit(err.authenticationFailed ? EXIT.AUTH : EXIT.CONNECTION)
} finally {
  await client.logout().catch(() => {})
}
