#!/usr/bin/env node
// delete.mjs — Delete a calendar event by UID.
// Usage: node delete.mjs --uid <uid> [--calendar <name-or-index>]

import { parseArgs } from 'node:util'
import { makeClient, findCalendar, EXIT } from './_shared.mjs'

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

if (!target) {
  console.error(`Event not found: ${values.uid}`)
  process.exit(EXIT.NOT_FOUND)
}

await client.deleteCalendarObject({ calendarObject: target })

console.log(JSON.stringify({ uid: values.uid, status: 'deleted' }))
