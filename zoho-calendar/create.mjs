#!/usr/bin/env node
// create.mjs — Create a calendar event.
import { parseArgs } from 'node:util'
import { EXIT, getAccessToken, zohoPost, zohoGet, parseDateArg, toZohoDateTime, toZohoDate } from './_shared.mjs'

const { values } = parseArgs({
  options: {
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
  console.log(`Usage: node create.mjs --title <text> --start <datetime> [--end <datetime>]
               [--calendar <uid>] [--location <text>] [--description <text>]
               [--attendees <emails>] [--all-day] [--timezone <tz>]

Exit codes: 0 success, 1 usage, 2 auth, 3 connection`)
  process.exit(EXIT.OK)
}

if (!values.title) { console.error('--title is required'); process.exit(EXIT.USAGE) }
if (!values.start) { console.error('--start is required'); process.exit(EXIT.USAGE) }

const token = await getAccessToken()

// Resolve calendar
let calUid = values.calendar
if (!calUid) {
  const cals = await zohoGet('/calendars', token)
  const first = (cals.calendars ?? []).find(c => c.isdefault) ?? cals.calendars?.[0]
  if (!first) { console.error('No calendars found'); process.exit(EXIT.NOT_FOUND) }
  calUid = first.uid
}

const allDay = values['all-day'] ?? false
const startDate = parseDateArg(values.start)
const endDate = values.end ? parseDateArg(values.end) : (() => { const d = new Date(startDate); d.setHours(d.getHours() + 1); return d })()

const eventdata = {
  title: values.title,
  dateandtime: {
    timezone: values.timezone ?? 'UTC',
    start: allDay ? toZohoDate(startDate) : toZohoDateTime(startDate),
    end: allDay ? toZohoDate(endDate) : toZohoDateTime(endDate),
  },
}

if (values.location) eventdata.location = values.location
if (values.description) eventdata.description = values.description
if (values.attendees) {
  eventdata.attendees = values.attendees.split(',').map(e => ({ email: e.trim() }))
}

const data = await zohoPost(`/calendars/${calUid}/events`, token, { eventdata })

const uid = data.events?.[0]?.uid ?? null
console.log(JSON.stringify({ uid, status: 'created' }))
