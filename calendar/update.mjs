#!/usr/bin/env node
// update.mjs — Update an existing calendar event by UID.
// Usage: node update.mjs --uid <uid> [--calendar <name-or-index>] [field flags...]

import { parseArgs } from 'node:util'
import {
  makeClient, findCalendar, parseDateArg,
  parseVEvents, icalDateProp, buildVCalendar, icalEscape,
  getRawVEventLines, replaceOrAddProp, removeProp, EXIT,
} from './_shared.mjs'

const { values } = parseArgs({
  options: {
    uid:         { type: 'string' },
    calendar:    { type: 'string' },
    summary:     { type: 'string' },
    start:       { type: 'string' },
    end:         { type: 'string' },
    location:    { type: 'string' },
    description: { type: 'string' },
    attendees:   { type: 'string' },
    timezone:    { type: 'string' },
  },
  strict: true,
})

if (!values.uid) { console.error('--uid is required'); process.exit(EXIT.USAGE) }

const client = await makeClient()
const allCalendars = await client.fetchCalendars()
const calendar = findCalendar(allCalendars, values.calendar)

if (!calendar) {
  console.error(values.calendar
    ? `Calendar not found: "${values.calendar}".`
    : 'No calendars found.')
  process.exit(EXIT.NOT_FOUND)
}

const objects = await client.fetchCalendarObjects({ calendar })
const target = objects.find(o => {
  const fileUid = o.url.split('/').pop()?.replace(/\.ics$/, '')
  return fileUid === values.uid || o.data?.includes(`UID:${values.uid}`)
})

if (!target?.data) {
  console.error(`Event not found: ${values.uid}`)
  process.exit(EXIT.NOT_FOUND)
}

const vevents = parseVEvents(target.data)
if (!vevents.length) {
  console.error(`No VEVENT found for UID: ${values.uid}`)
  process.exit(EXIT.NOT_FOUND)
}

const props = vevents[0]

// Start from the raw VEVENT lines — preserves all properties not explicitly handled
// (ORGANIZER, CATEGORIES, VALARM blocks, EXDATE, etc.)
const lines = getRawVEventLines(target.data)

const allDay = props['DTSTART']?.params?.VALUE === 'DATE' || /^\d{8}$/.test(props['DTSTART']?.value ?? '')
const tz = values.timezone ?? props['DTSTART']?.params?.TZID ?? null
const now = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '') + 'Z'

// RFC 5545 §3.8.7.4: increment SEQUENCE on every modification
const seqLine = lines.find(l => l.toUpperCase().startsWith('SEQUENCE:'))
const seqVal  = seqLine ? (parseInt(seqLine.split(':')[1] ?? '0', 10) || 0) : 0
replaceOrAddProp(lines, 'SEQUENCE',      `SEQUENCE:${seqVal + 1}`)
replaceOrAddProp(lines, 'DTSTAMP',       `DTSTAMP:${now}`)
replaceOrAddProp(lines, 'LAST-MODIFIED', `LAST-MODIFIED:${now}`)

if (values.start) replaceOrAddProp(lines, 'DTSTART', icalDateProp('DTSTART', parseDateArg(values.start), allDay, tz))
if (values.end)   replaceOrAddProp(lines, 'DTEND',   icalDateProp('DTEND',   parseDateArg(values.end),   allDay, tz))

if (values.summary !== undefined) {
  replaceOrAddProp(lines, 'SUMMARY', `SUMMARY:${icalEscape(values.summary)}`)
}
if (values.location !== undefined) {
  if (values.location) replaceOrAddProp(lines, 'LOCATION', `LOCATION:${icalEscape(values.location)}`)
  else removeProp(lines, 'LOCATION')
}
if (values.description !== undefined) {
  if (values.description) replaceOrAddProp(lines, 'DESCRIPTION', `DESCRIPTION:${icalEscape(values.description)}`)
  else removeProp(lines, 'DESCRIPTION')
}
if (values.attendees !== undefined) {
  removeProp(lines, 'ATTENDEE')
  for (const addr of values.attendees.split(',').map(s => s.trim()).filter(Boolean)) {
    lines.push(`ATTENDEE:mailto:${addr}`)
  }
}

const icalData = buildVCalendar(lines)

try {
  await client.updateCalendarObject({
    calendarObject: {
      url:  target.url,
      data: icalData,
      etag: target.etag,
    },
  })
} catch (err) {
  if (/412|precondition/i.test(err.message)) {
    console.error('Etag conflict: event was modified externally. Re-fetch with event.mjs and retry.')
    process.exit(EXIT.CONFLICT)
  }
  throw err
}

console.log(JSON.stringify({ uid: values.uid, status: 'updated' }))
