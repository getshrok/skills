#!/usr/bin/env node
// delete.mjs — Delete a calendar event.
import { parseArgs } from 'node:util'
import { EXIT, getAccessToken, zohoGet, zohoDelete } from './_shared.mjs'

const { values } = parseArgs({
  options: {
    uid:      { type: 'string' },
    calendar: { type: 'string' },
    help:     { type: 'boolean' },
  },
  strict: true,
})

if (values.help) {
  console.log(`Usage: node delete.mjs --uid <eventUid> --calendar <calendarUid>

Exit codes: 0 success, 1 usage, 2 auth, 3 connection, 4 not found, 5 etag conflict`)
  process.exit(EXIT.OK)
}

if (!values.uid) { console.error('--uid is required'); process.exit(EXIT.USAGE) }
if (!values.calendar) { console.error('--calendar is required'); process.exit(EXIT.USAGE) }

const token = await getAccessToken()

// Fetch etag first
const current = await zohoGet(`/calendars/${values.calendar}/events/${values.uid}`, token)
if (!current.events?.[0]) { console.error('Event not found'); process.exit(EXIT.NOT_FOUND) }
const etag = current.events[0].etag

await zohoDelete(`/calendars/${values.calendar}/events/${values.uid}`, token, etag)

console.log(JSON.stringify({ uid: values.uid, status: 'deleted' }))
