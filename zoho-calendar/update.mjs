#!/usr/bin/env node
// update.mjs — Update a calendar event (etag-checked).
import { parseArgs } from 'node:util'
import { EXIT, getAccessToken, zohoGet, zohoPut, parseDateArg, toZohoDateTime, toZohoDate } from './_shared.mjs'

const { values } = parseArgs({
  options: {
    uid:         { type: 'string' },
    calendar:    { type: 'string' },
    title:       { type: 'string' },
    start:       { type: 'string' },
    end:         { type: 'string' },
    location:    { type: 'string' },
    description: { type: 'string' },
    attendees:   { type: 'string' },
    'all-day':   { type: 'boolean' },
    timezone:    { type: 'string' },
    help:        { type: 'boolean' },
  },
  strict: true,
})

if (values.help) {
  console.log(`Usage: node update.mjs --uid <eventUid> --calendar <calendarUid> [--title <text>]
               [--start <datetime>] [--end <datetime>] [--location <text>]
               [--description <text>] [--attendees <emails>] [--timezone <tz>]

Exit codes: 0 success, 1 usage, 2 auth, 3 connection, 4 not found, 5 etag conflict`)
  process.exit(EXIT.OK)
}

if (!values.uid) { console.error('--uid is required'); process.exit(EXIT.USAGE) }
if (!values.calendar) { console.error('--calendar is required'); process.exit(EXIT.USAGE) }

const token = await getAccessToken()

// Fetch current event to get etag
const current = await zohoGet(`/calendars/${values.calendar}/events/${values.uid}`, token)
if (!current.events?.[0]) { console.error('Event not found'); process.exit(EXIT.NOT_FOUND) }
const etag = current.events[0].etag

// Zoho requires dateandtime on every update — start with current values
const curDt = current.events[0].dateandtime ?? {}
const eventdata = {
  dateandtime: {
    timezone: values.timezone ?? curDt.timezone ?? 'UTC',
    start: curDt.start,
    end: curDt.end,
  },
}

if (values.title) eventdata.title = values.title
if (values.location) eventdata.location = values.location
if (values.description) eventdata.description = values.description
if (values.attendees) eventdata.attendees = values.attendees.split(',').map(e => ({ email: e.trim() }))

if (values.start) {
  const allDay = values['all-day'] ?? false
  const d = parseDateArg(values.start)
  eventdata.dateandtime.start = allDay ? toZohoDate(d) : toZohoDateTime(d)
}
if (values.end) {
  const allDay = values['all-day'] ?? false
  const d = parseDateArg(values.end)
  eventdata.dateandtime.end = allDay ? toZohoDate(d) : toZohoDateTime(d)
}

const data = await zohoPut(`/calendars/${values.calendar}/events/${values.uid}`, token, { eventdata }, etag)

console.log(JSON.stringify({ uid: values.uid, status: 'updated' }))
