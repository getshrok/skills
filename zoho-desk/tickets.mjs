#!/usr/bin/env node
// tickets.mjs — List or search Zoho Desk tickets.
// Usage: node tickets.mjs [--search <query>] [--status <status>] [--since <date>] [--dept-id <id>] [--limit N] [--sort-by <field>] [--help]

import { parseArgs } from 'node:util'
import { EXIT, getAccessToken, requireOrgId, deskGet, parseDateArg, toLocalISO } from './_shared.mjs'

const { values } = parseArgs({
  options: {
    search:    { type: 'string' },
    status:    { type: 'string' },
    since:     { type: 'string' },
    'dept-id': { type: 'string' },
    limit:     { type: 'string', default: '20' },
    'sort-by': { type: 'string', default: '-createdTime' },
    help:      { type: 'boolean' },
  },
  strict: true,
})

if (values.help) {
  console.log(`Usage: node tickets.mjs [--search <query>] [--status <status>] [--since <date>] [--dept-id <id>] [--limit N] [--sort-by <field>] [--help]

Lists or searches Zoho Desk tickets.
  --search      Full-text search query
  --status      Filter by status (e.g. Open, Closed, On Hold)
  --since       Only return tickets modified since this time. Accepts ISO 8601
                (local timezone if no offset given), "today", "yesterday",
                "next <weekday>", or "N days/weeks/months ago".
  --dept-id     Department ID to filter by (defaults to ZOHO_DESK_DEPT_ID env var)
  --limit N     Max results (default: 20)
  --sort-by     Field to sort by (default: -createdTime)

Timestamps in the output use ISO 8601 with the local timezone offset.

Exit codes: 0 success, 1 usage, 2 auth, 3 connection`)
  process.exit(EXIT.OK)
}

const token = await getAccessToken()
const orgId = requireOrgId()
const limit = String(parseInt(values.limit, 10) || 20)
const deptId = values['dept-id'] ?? process.env.ZOHO_DESK_DEPT_ID
const since = values.since ? parseDateArg(values.since) : null

let tickets
if (values.search) {
  const params = new URLSearchParams({ module: 'tickets', searchStr: values.search, limit })
  if (deptId) params.set('departmentId', deptId)
  const data = await deskGet(`/search?${params}`, token, orgId)
  tickets = data.data ?? []
} else {
  const params = new URLSearchParams({ limit, sortBy: values['sort-by'], include: 'contacts,assignee' })
  if (values.status) params.set('status', values.status)
  if (deptId) params.set('departmentId', deptId)
  // The Desk API doesn't expose a server-side modifiedTime filter on the list
  // endpoint, so --since is applied client-side. To compensate, raise the
  // server limit when --since is set so meaningful work remains after filtering.
  if (since) params.set('limit', String(Math.max(parseInt(limit, 10), 100)))
  const data = await deskGet(`/tickets?${params}`, token, orgId)
  tickets = data.data ?? []
}

if (since) {
  tickets = tickets.filter(t => {
    const m = t.modifiedTime ? new Date(t.modifiedTime) : null
    return m && m > since
  }).slice(0, parseInt(limit, 10))
}

const out = tickets.map(t => ({
  id:           t.id,
  ticketNumber: t.ticketNumber,
  subject:      t.subject,
  status:       t.status,
  priority:     t.priority,
  contact:      t.contact?.firstName ? `${t.contact.firstName} ${t.contact.lastName ?? ''}`.trim() : (t.contactId ?? null),
  assignee:     t.assignee?.firstName ? `${t.assignee.firstName} ${t.assignee.lastName ?? ''}`.trim() : null,
  createdAt:    toLocalISO(t.createdTime ? new Date(t.createdTime) : null),
  updatedAt:    toLocalISO(t.modifiedTime ? new Date(t.modifiedTime) : null),
}))
console.log(JSON.stringify(out, null, 2))
