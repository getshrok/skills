#!/usr/bin/env node
// send.mjs — Send email via Zoho Mail REST API.
// Usage: node send.mjs --to <addr> [--to <addr>...] --subject <text> --body <text>
//                      [--cc <addr>] [--bcc <addr>] [--reply-to-id <msgid>]
//                      [--attachment <path>] [--help]

import { readFileSync } from 'node:fs'
import { basename } from 'node:path'
import { parseArgs } from 'node:util'
import { EXIT, getAccessToken, requireAccountId } from './_shared.mjs'

const { values } = parseArgs({
  options: {
    to:            { type: 'string', multiple: true },
    subject:       { type: 'string' },
    body:          { type: 'string' },
    cc:            { type: 'string', multiple: true },
    bcc:           { type: 'string', multiple: true },
    'reply-to-id': { type: 'string' },
    attachment:    { type: 'string', multiple: true },
    help:          { type: 'boolean' },
  },
  strict: true,
})

if (values.help || (!values.to?.length && !values.body)) {
  console.log(`Usage: node send.mjs --to <addr> --subject <text> --body <text>
               [--to <addr>...] [--cc <addr>] [--bcc <addr>]
               [--reply-to-id <msgId>] [--attachment <path>] [--help]

Exit codes: 0 success, 1 usage, 2 auth, 3 connection, 4 not found`)
  process.exit(EXIT.OK)
}

if (!values.to?.length) { console.error('--to is required'); process.exit(EXIT.USAGE) }
if (!values.body)       { console.error('--body is required'); process.exit(EXIT.USAGE) }
if (!values.subject && !values['reply-to-id']) {
  console.error('--subject is required unless replying with --reply-to-id')
  process.exit(EXIT.USAGE)
}

const { ZOHO_FROM_ADDRESS } = process.env
if (!ZOHO_FROM_ADDRESS) { console.error('ZOHO_FROM_ADDRESS is not set'); process.exit(EXIT.AUTH) }

const token = await getAccessToken()
const accountId = requireAccountId()
const base = `https://mail.zoho.com/api/accounts/${accountId}`

// Upload attachments and collect IDs
const attachmentIds = []
for (const filePath of (values.attachment ?? [])) {
  let fileData
  try { fileData = readFileSync(filePath) } catch (err) {
    console.error(`Cannot read attachment: ${filePath} — ${err.message}`)
    process.exit(EXIT.USAGE)
  }

  const form = new FormData()
  form.append('attach', new Blob([fileData]), basename(filePath))

  let res
  try {
    res = await fetch(`${base}/messages/attachments`, {
      method: 'POST',
      headers: { Authorization: `Zoho-oauthtoken ${token}` },
      body: form,
    })
  } catch (err) {
    console.error(`Connection error uploading attachment: ${err.message}`)
    process.exit(EXIT.CONNECTION)
  }

  if (!res.ok) {
    console.error(`Attachment upload failed (${res.status}): ${await res.text()}`)
    process.exit(EXIT.CONNECTION)
  }

  const data = await res.json()
  attachmentIds.push(data.data?.attachmentId ?? data.attachmentId)
}

// Build message payload
let subject = values.subject ?? ''
if (!subject && values['reply-to-id']) subject = 'Re: (no subject)'
else if (values['reply-to-id'] && !subject.toLowerCase().startsWith('re:')) subject = `Re: ${subject}`

const payload = {
  fromAddress: ZOHO_FROM_ADDRESS,
  toAddress:   values.to.join(','),
  subject,
  content:     values.body,
  mailFormat:  'plaintext',
  ...(values.cc?.length  ? { ccAddress:  values.cc.join(',')  } : {}),
  ...(values.bcc?.length ? { bccAddress: values.bcc.join(',') } : {}),
  ...(values['reply-to-id'] ? { inReplyTo: values['reply-to-id'] } : {}),
  ...(attachmentIds.length  ? { attachments: attachmentIds.map(id => ({ attachmentId: id })) } : {}),
}

let res
try {
  res = await fetch(`${base}/messages`, {
    method: 'POST',
    headers: {
      Authorization:  `Zoho-oauthtoken ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  })
} catch (err) {
  console.error(`Connection error: ${err.message}`)
  process.exit(EXIT.CONNECTION)
}

if (res.status === 401 || res.status === 403) {
  console.error(`Auth error (${res.status}) — check credentials`)
  process.exit(EXIT.AUTH)
}

if (!res.ok) {
  console.error(`API error (${res.status}): ${await res.text()}`)
  process.exit(EXIT.CONNECTION)
}

const data = await res.json()
const messageId = data.data?.messageId ?? data.messageId ?? null
console.log(JSON.stringify({ ok: true, messageId }))
