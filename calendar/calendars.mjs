#!/usr/bin/env node
// calendars.mjs — List all available CalDAV calendars.
// Usage: node calendars.mjs

import { makeClient } from './_shared.mjs'

const client = await makeClient()
const calendars = await client.fetchCalendars()

const result = calendars.map((c, i) => ({
  index:       i,
  name:        c.displayName ?? '',
  url:         c.url ?? '',
  description: c.description ?? '',
  color:       c.calendarColor ?? '',
  writable:    !c.readOnly,
}))

console.log(JSON.stringify(result, null, 2))
