#!/usr/bin/env node
// event.mjs — Get full detail for a single event by UID.
// Usage: node event.mjs --uid <uid> [--calendar <name-or-index>]

import { parseArgs } from 'node:util'
import { makeClient, findCalendar, parseVEvents, normalizeEventDetail, parseAlarms, EXIT } from './_shared.mjs'

const { values } = parseArgs({
  options: {
    uid:      { type: 'string' },
    calendar: { type: 'string' },
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
  console.error(`No VEVENT found in object: ${values.uid}`)
  process.exit(EXIT.NOT_FOUND)
}

const event = normalizeEventDetail(vevents[0], values.uid)
const alarms = parseAlarms(target.data)
if (alarms.length) event.alarms = alarms

console.log(JSON.stringify(event, null, 2))
