#!/usr/bin/env node
// create.mjs — Create a calendar event.
// Usage: node create.mjs --summary <text> --start <datetime> --end <datetime> [options]

import { parseArgs } from 'node:util'
import {
  makeClient, findCalendar, parseDateArg,
  generateUID, icalDateProp, buildVCalendar, icalEscape, EXIT,
} from './_shared.mjs'

const { values } = parseArgs({
  options: {
    calendar:    { type: 'string' },
    summary:     { type: 'string' },
    start:       { type: 'string' },
    end:         { type: 'string' },
    location:    { type: 'string' },
    description: { type: 'string' },
    attendees:   { type: 'string' },
    'all-day':   { type: 'boolean', default: false },
    timezone:    { type: 'string' },
  },
  strict: true,
})

if (!values.summary) { console.error('--summary is required'); process.exit(EXIT.USAGE) }
if (!values.start)   { console.error('--start is required');   process.exit(EXIT.USAGE) }
if (!values['all-day'] && !values.end) { console.error('--end is required unless --all-day'); process.exit(EXIT.USAGE) }

const startDate = parseDateArg(values.start)
const endDate   = values.end ? parseDateArg(values.end) : (() => {
  const d = new Date(startDate); d.setDate(d.getDate() + 1); return d
})()

const uid = generateUID()
const now = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '') + 'Z'
const allDay = values['all-day']
const tz = values.timezone ?? null

const lines = [
  `UID:${uid}`,
  `DTSTAMP:${now}`,
  icalDateProp('DTSTART', startDate, allDay, tz),
  icalDateProp('DTEND', endDate, allDay, tz),
  `SUMMARY:${icalEscape(values.summary)}`,
]

if (values.location)    lines.push(`LOCATION:${icalEscape(values.location)}`)
if (values.description) lines.push(`DESCRIPTION:${icalEscape(values.description)}`)

if (values.attendees) {
  for (const addr of values.attendees.split(',').map(s => s.trim()).filter(Boolean)) {
    lines.push(`ATTENDEE:mailto:${addr}`)
  }
}

const icalData = buildVCalendar(lines)

const client = await makeClient()
const allCalendars = await client.fetchCalendars()
const calendar = findCalendar(allCalendars, values.calendar)

if (!calendar) {
  console.error(values.calendar
    ? `Calendar not found: "${values.calendar}".`
    : 'No writable calendars found.')
  process.exit(EXIT.NOT_FOUND)
}

await client.createCalendarObject({
  calendar,
  filename: `${uid}.ics`,
  iCalString: icalData,
})

console.log(JSON.stringify({ uid, status: 'created' }))
