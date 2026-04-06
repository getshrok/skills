#!/usr/bin/env node
// events.mjs — List events in a date range.
import { parseArgs } from 'node:util'
import { EXIT, getAccessToken, zohoGet, parseDateArg, toZohoDate, normalizeEvent } from './_shared.mjs'

const { values } = parseArgs({
  options: {
    calendar: { type: 'string' },
    from:     { type: 'string' },
    to:       { type: 'string' },
    limit:    { type: 'string' },
    help:     { type: 'boolean' },
  },
  strict: true,
})

if (values.help) {
  console.log(`Usage: node events.mjs [--calendar <uid>] [--from <date>] [--to <date>] [--limit <n>]

Options:
  --calendar  Calendar UID (default: first calendar)
  --from      Start date (default: today)
  --to        End date (default: 7 days from now)
  --limit     Max events (default: 50)

Exit codes: 0 success, 1 usage, 2 auth, 3 connection, 4 not found`)
  process.exit(EXIT.OK)
}

const token = await getAccessToken()

// Resolve calendar UID
let calUid = values.calendar
if (!calUid) {
  const cals = await zohoGet('/calendars', token)
  const first = (cals.calendars ?? []).find(c => c.isdefault) ?? cals.calendars?.[0]
  if (!first) { console.error('No calendars found'); process.exit(EXIT.NOT_FOUND) }
  calUid = first.uid
}

const from = values.from ? parseDateArg(values.from) : new Date()
const to = values.to ? parseDateArg(values.to) : (() => { const d = new Date(); d.setDate(d.getDate() + 7); return d })()
const limit = parseInt(values.limit ?? '50', 10)

const range = JSON.stringify({ start: toZohoDate(from), end: toZohoDate(to) })
const data = await zohoGet(`/calendars/${calUid}/events?range=${encodeURIComponent(range)}&byinstance=true`, token)

const events = (data.events ?? []).slice(0, limit).map(normalizeEvent)
console.log(JSON.stringify(events, null, 2))
