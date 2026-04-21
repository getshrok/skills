#!/usr/bin/env node
// message.mjs — Fetch full content of a single Zoho Mail message.
// Usage: node message.mjs --id <messageId> --folder <folderId> [--save-attachments <dir>]

import { parseArgs } from 'node:util'
import { writeFile, mkdir } from 'node:fs/promises'
import { join, basename } from 'node:path'
import { EXIT, getAccessToken, zohoGet } from './_shared.mjs'

const { values } = parseArgs({
  options: {
    id:                 { type: 'string' },
    folder:             { type: 'string' },
    'save-attachments': { type: 'string' },
  },
  strict: true,
})

if (!values.id)     { console.error('--id is required');     process.exit(EXIT.USAGE) }
if (!values.folder) { console.error('--folder is required'); process.exit(EXIT.USAGE) }

const token = await getAccessToken()

// Fetch message content
const data = await zohoGet(`/folders/${values.folder}/messages/${values.id}/content`, token)
const m = data.data ?? data

if (!m || (!m.content && !m.htmlContent && !m.textContent)) {
  console.error(`Message not found: id=${values.id} folder=${values.folder}`)
  process.exit(EXIT.NOT_FOUND)
}

const attachments = []
if (m.attachments?.length && values['save-attachments']) {
  await mkdir(values['save-attachments'], { recursive: true })
  for (const att of m.attachments) {
    const attData = await zohoGet(
      `/folders/${values.folder}/messages/${values.id}/attachments/${att.attachmentId}`,
      token
    )
    const filename = att.attachmentName ?? `attachment-${att.attachmentId}`
    const dest = join(values['save-attachments'], basename(filename))
    // attData may be base64 encoded content
    const buf = Buffer.from(attData.data ?? attData, 'base64')
    await writeFile(dest, buf)
    attachments.push({ filename, mimeType: att.mimeType ?? 'application/octet-stream', size: att.size ?? buf.length, saved: dest })
  }
} else if (m.attachments?.length) {
  for (const att of m.attachments) {
    attachments.push({ filename: att.attachmentName, mimeType: att.mimeType ?? 'application/octet-stream', size: att.size ?? 0 })
  }
}

const out = {
  id:       values.id,
  folderId: values.folder,
  from:     m.fromAddress ?? m.sender,
  to:       m.toAddress   ? m.toAddress.split(',').map(a => a.trim())   : [],
  cc:       m.ccAddress   ? m.ccAddress.split(',').map(a => a.trim())   : [],
  subject:  m.subject ?? '(no subject)',
  date:     m.receivedTime ? new Date(parseInt(m.receivedTime)).toISOString() : null,
  headers: {
    'message-id': m.messageId ?? values.id,
    ...(m.inReplyTo  ? { 'in-reply-to': m.inReplyTo }  : {}),
    ...(m.references ? { references:    m.references }  : {}),
  },
  body: {
    plain: m.textContent ?? m.content ?? '',
    html:  m.htmlContent ?? '',
  },
  attachments,
}

console.log(JSON.stringify(out, null, 2))
