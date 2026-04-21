#!/usr/bin/env node
// events.mjs — List or search events in a date range.
// Usage: node events.mjs [--calendar <name-or-index>] [--from <date>] [--to <date>]
//                        [--query <text>] [--limit <n>]

import { parseArgs } from 'node:util'
import { makeClient, findCalendar, parseDateArg, parseVEvents, normalizeEvent } from './_shared.mjs'

const { values } = parseArgs({
  options: {
    calendar: { type: 'string' },
    from:     { type: 'string' },
    to:       { type: 'string' },
    query:    { type: 'string' },
    limit:    { type: 'string', default: '50' },
  },
  strict: true,
})

const limit = parseInt(values.limit, 10)
if (isNaN(limit) || limit < 1) { console.error('--limit must be a positive integer'); process.exit(1) }

const fromDate = values.from ? parseDateArg(values.from) : new Date()
const toDate   = values.to   ? parseDateArg(values.to)   : (() => { const d = new Date(); d.setDate(d.getDate() + 7); return d })()

const client = await makeClient()
const allCalendars = await client.fetchCalendars()
const calendar = findCalendar(allCalendars, values.calendar)

if (!calendar) {
  console.error(values.calendar
    ? `Calendar not found: "${values.calendar}". Run calendars.mjs to see available calendars.`
    : 'No calendars found.')
  process.exit(4)
}

const objects = await client.fetchCalendarObjects({
  calendar,
  timeRange: { start: fromDate.toISOString(), end: toDate.toISOString() },
})

const query = values.query?.toLowerCase()
const results = []

for (const obj of objects) {
  const icalStr = obj.data
  if (!icalStr) continue
  const uid = obj.url.split('/').pop()?.replace(/\.ics$/, '') ?? ''
  const vevents = parseVEvents(icalStr)

  for (const props of vevents) {
    const event = normalizeEvent(props, uid)
    if (query) {
      const haystack = `${event.summary} ${event.location} ${event.description}`.toLowerCase()
      if (!haystack.includes(query)) continue
    }
    results.push({ ...event, recurrence: !!event.rrule })
    if (event.rrule) delete results[results.length - 1].rrule
  }

  if (results.length >= limit) break
}

results.sort((a, b) => (a.start ?? '').localeCompare(b.start ?? ''))
console.log(JSON.stringify(results.slice(0, limit), null, 2))
