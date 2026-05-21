#!/usr/bin/env node
// ticket.mjs — Get a Zoho Desk ticket with its comments and email threads.
// Usage: node ticket.mjs --id <ticketId> [--threads] [--comments] [--help]

import { parseArgs } from 'node:util'
import { EXIT, getAccessToken, requireOrgId, deskGet, toLocalISO } from './_shared.mjs'

const { values } = parseArgs({
  options: {
    id:       { type: 'string' },
    threads:  { type: 'boolean', default: false },
    comments: { type: 'boolean', default: false },
    help:     { type: 'boolean' },
  },
  strict: true,
})

if (values.help || !values.id) {
  console.log(`Usage: node ticket.mjs --id <ticketId> [--threads] [--comments] [--help]

Fetches a single Zoho Desk ticket. Optionally include email threads and/or comments.
  --id          Ticket ID (required)
  --threads     Include email thread messages
  --comments    Include agent/customer comments

Timestamps in the output use ISO 8601 with the local timezone offset.

Exit codes: 0 success, 1 usage, 2 auth, 3 connection, 4 not found`)
  process.exit(values.help ? EXIT.OK : EXIT.USAGE)
}

const token = await getAccessToken()
const orgId = requireOrgId()

const [ticketData, threadsData, commentsData] = await Promise.all([
  deskGet(`/tickets/${values.id}`, token, orgId),
  values.threads  ? deskGet(`/tickets/${values.id}/threads?limit=20`, token, orgId)  : null,
  values.comments ? deskGet(`/tickets/${values.id}/comments?limit=20`, token, orgId) : null,
])

const out = {
  id:           ticketData.id,
  ticketNumber: ticketData.ticketNumber,
  subject:      ticketData.subject,
  status:       ticketData.status,
  priority:     ticketData.priority,
  description:  ticketData.description ?? '',
  contact:      ticketData.contact?.email ?? ticketData.contactId ?? null,
  assignee:     ticketData.assignee?.firstName ? `${ticketData.assignee.firstName} ${ticketData.assignee.lastName ?? ''}`.trim() : null,
  createdAt:    toLocalISO(ticketData.createdTime ? new Date(ticketData.createdTime) : null),
  updatedAt:    toLocalISO(ticketData.modifiedTime ? new Date(ticketData.modifiedTime) : null),
}

if (threadsData) {
  out.threads = (threadsData.data ?? []).map(t => ({
    id:        t.id,
    type:      t.type,
    from:      t.from?.email ?? t.from ?? null,
    summary:   t.summary ?? '',
    content:   t.content ?? '',
    createdAt: toLocalISO(t.createdTime ? new Date(t.createdTime) : null),
  }))
}

if (commentsData) {
  out.comments = (commentsData.data ?? []).map(c => ({
    id:        c.id,
    author:    c.commentor?.firstName ? `${c.commentor.firstName} ${c.commentor.lastName ?? ''}`.trim() : null,
    content:   c.content ?? '',
    isPublic:  c.isPublic ?? false,
    createdAt: toLocalISO(c.createdTime ? new Date(c.createdTime) : null),
  }))
}

console.log(JSON.stringify(out, null, 2))
