#!/usr/bin/env node
// event.mjs — Get full detail for a single event.
import { parseArgs } from 'node:util'
import { EXIT, getAccessToken, zohoGet, normalizeEvent } from './_shared.mjs'

const { values } = parseArgs({
  options: {
    uid:      { type: 'string' },
    calendar: { type: 'string' },
    help:     { type: 'boolean' },
  },
  strict: true,
})

if (values.help) {
  console.log(`Usage: node event.mjs --uid <eventUid> --calendar <calendarUid>

Exit codes: 0 success, 1 usage, 2 auth, 3 connection, 4 not found`)
  process.exit(EXIT.OK)
}

if (!values.uid) { console.error('--uid is required'); process.exit(EXIT.USAGE) }
if (!values.calendar) { console.error('--calendar is required'); process.exit(EXIT.USAGE) }

const token = await getAccessToken()
const data = await zohoGet(`/calendars/${values.calendar}/events/${values.uid}`, token)

if (!data.events?.[0]) { console.error('Event not found'); process.exit(EXIT.NOT_FOUND) }

const event = normalizeEvent(data.events[0])
// Add extra detail fields
event.description = data.events[0].description ?? ''
event.rrule = data.events[0].rrule ?? null

console.log(JSON.stringify(event, null, 2))
