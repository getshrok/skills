#!/usr/bin/env node
// send.mjs — Send or reply to email via SMTP.
// Usage: node send.mjs --to <addr> --body <text> [--subject <text>] [--reply-to-id <msgid>]
//                      [--references <chain>] [--cc <addr>] [--bcc <addr>] [--attachment <path>]

import { createTransport } from 'nodemailer'
import { parseArgs } from 'node:util'
import { EXIT } from './_shared.mjs'

const { values } = parseArgs({
  options: {
    to:           { type: 'string', multiple: true },
    subject:      { type: 'string' },
    body:         { type: 'string' },
    cc:           { type: 'string', multiple: true },
    bcc:          { type: 'string', multiple: true },
    'reply-to-id': { type: 'string' },
    'references':  { type: 'string' },
    attachment:   { type: 'string', multiple: true },
  },
  strict: true,
})

if (!values.to?.length)   { console.error('--to is required'); process.exit(EXIT.USAGE) }
if (!values.body)          { console.error('--body is required'); process.exit(EXIT.USAGE) }
if (!values.subject && !values['reply-to-id']) {
  console.error('--subject is required unless replying with --reply-to-id'); process.exit(EXIT.USAGE)
}

const {
  SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM,
} = process.env

if (!SMTP_HOST) { console.error('SMTP_HOST is not set'); process.exit(EXIT.AUTH) }
if (!SMTP_USER) { console.error('SMTP_USER is not set'); process.exit(EXIT.AUTH) }
if (!SMTP_PASS) { console.error('SMTP_PASS is not set'); process.exit(EXIT.AUTH) }

const port = parseInt(SMTP_PORT ?? '587', 10)
const secure = port === 465

const transport = createTransport({
  host: SMTP_HOST,
  port,
  secure,
  auth: { user: SMTP_USER, pass: SMTP_PASS },
})

// Build subject: prefix Re: for replies if not already present
let subject = values.subject ?? ''
if (!subject && values['reply-to-id']) {
  subject = 'Re: (no subject)'
} else if (values['reply-to-id'] && !subject.toLowerCase().startsWith('re:')) {
  subject = `Re: ${subject}`
}

const message = {
  from: SMTP_FROM ?? SMTP_USER,
  to:   values.to,
  subject,
  text: values.body,
  ...(values.cc?.length  ? { cc: values.cc }  : {}),
  ...(values.bcc?.length ? { bcc: values.bcc } : {}),
  ...(values['reply-to-id'] ? {
    inReplyTo:  values['reply-to-id'],
    references: values['references']
      ? `${values['references']} ${values['reply-to-id']}`
      : values['reply-to-id'],
  } : {}),
  ...(values.attachment?.length ? {
    attachments: values.attachment.map(p => ({ path: p })),
  } : {}),
}

try {
  const info = await transport.sendMail(message)
  console.log(JSON.stringify({ ok: true, messageId: info.messageId }))
} catch (err) {
  console.error(err.message)
  const isAuth = /auth|credentials|535|534|username|password/i.test(err.message)
  process.exit(isAuth ? EXIT.AUTH : EXIT.CONNECTION)
}
