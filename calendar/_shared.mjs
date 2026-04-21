// _shared.mjs — Shared utilities for calendar scripts.

import { createDAVClient } from 'tsdav'
import { randomUUID } from 'node:crypto'

export const EXIT = {
  OK:         0,
  USAGE:      1,
  AUTH:       2,
  CONNECTION: 3,
  NOT_FOUND:  4,
  CONFLICT:   5,
}

// ─── Client ───────────────────────────────────────────────────────────────────

export async function makeClient() {
  const { CALDAV_URL, CALDAV_AUTH_METHOD = 'basic', CALDAV_USER, CALDAV_PASS,
          CALDAV_TOKEN_URL, CALDAV_REFRESH_TOKEN, CALDAV_CLIENT_ID, CALDAV_CLIENT_SECRET } = process.env

  if (!CALDAV_URL) { console.error('CALDAV_URL is not set'); process.exit(EXIT.CONNECTION) }

  const method = CALDAV_AUTH_METHOD.toLowerCase()

  if (method === 'oauth') {
    if (!CALDAV_TOKEN_URL)     { console.error('CALDAV_TOKEN_URL is not set'); process.exit(EXIT.AUTH) }
    if (!CALDAV_CLIENT_ID)     { console.error('CALDAV_CLIENT_ID is not set'); process.exit(EXIT.AUTH) }
    if (!CALDAV_CLIENT_SECRET) { console.error('CALDAV_CLIENT_SECRET is not set'); process.exit(EXIT.AUTH) }
    if (!CALDAV_REFRESH_TOKEN) { console.error('CALDAV_REFRESH_TOKEN is not set'); process.exit(EXIT.AUTH) }
    return createDAVClient({
      serverUrl: CALDAV_URL,
      credentials: {
        tokenUrl: CALDAV_TOKEN_URL,
        clientId: CALDAV_CLIENT_ID,
        clientSecret: CALDAV_CLIENT_SECRET,
        refreshToken: CALDAV_REFRESH_TOKEN,
      },
      authMethod: 'Oauth',
      defaultAccountType: 'caldav',
    })
  }

  // Basic auth (default)
  if (!CALDAV_USER) { console.error('CALDAV_USER is not set'); process.exit(EXIT.AUTH) }
  if (!CALDAV_PASS) { console.error('CALDAV_PASS is not set'); process.exit(EXIT.AUTH) }
  return createDAVClient({
    serverUrl: CALDAV_URL,
    credentials: { username: CALDAV_USER, password: CALDAV_PASS },
    authMethod: 'Basic',
    defaultAccountType: 'caldav',
  })
}

// ─── Calendar resolution ──────────────────────────────────────────────────────

export function findCalendar(calendars, nameOrIndex) {
  if (!nameOrIndex) {
    return calendars.find(c => !c.readOnly) ?? calendars[0] ?? null
  }
  const idx = parseInt(nameOrIndex, 10)
  if (!isNaN(idx) && idx >= 0 && idx < calendars.length) return calendars[idx]
  const lower = nameOrIndex.toLowerCase()
  return calendars.find(c => (c.displayName ?? '').toLowerCase().includes(lower)) ?? null
}

// ─── Date parsing ─────────────────────────────────────────────────────────────

const DAY_NAMES = ['sunday','monday','tuesday','wednesday','thursday','friday','saturday']

export function parseDateArg(value, exitOnError = true) {
  const s = value.trim()
  const lower = s.toLowerCase()

  if (lower === 'today')     return startOfDay(new Date())
  if (lower === 'tomorrow')  { const d = startOfDay(new Date()); d.setDate(d.getDate() + 1); return d }
  if (lower === 'yesterday') { const d = startOfDay(new Date()); d.setDate(d.getDate() - 1); return d }

  const nextDay = lower.match(/^next\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday)$/)
  if (nextDay) {
    const target = DAY_NAMES.indexOf(nextDay[1])
    const d = new Date()
    const diff = ((target - d.getDay() + 7) % 7) || 7
    d.setDate(d.getDate() + diff)
    return startOfDay(d)
  }

  const ago = s.match(/^(\d+)\s+(day|week|month)s?\s+ago$/i)
  if (ago) {
    const n = parseInt(ago[1], 10)
    const d = new Date()
    if (ago[2].toLowerCase() === 'day')   d.setDate(d.getDate() - n)
    if (ago[2].toLowerCase() === 'week')  d.setDate(d.getDate() - n * 7)
    if (ago[2].toLowerCase() === 'month') d.setMonth(d.getMonth() - n)
    return d
  }

  const ahead = s.match(/^in\s+(\d+)\s+(day|week|month)s?$/i)
  if (ahead) {
    const n = parseInt(ahead[1], 10)
    const d = new Date()
    if (ahead[2].toLowerCase() === 'day')   d.setDate(d.getDate() + n)
    if (ahead[2].toLowerCase() === 'week')  d.setDate(d.getDate() + n * 7)
    if (ahead[2].toLowerCase() === 'month') d.setMonth(d.getMonth() + n)
    return d
  }

  const d = new Date(s)
  if (!isNaN(d.getTime())) return d

  console.error(`Invalid date: "${value}". Use ISO 8601, "today/tomorrow/yesterday", "next <weekday>", "in N days/weeks", or "N days ago".`)
  if (exitOnError) process.exit(EXIT.USAGE)
  return null
}

function startOfDay(d) {
  d.setHours(0, 0, 0, 0)
  return d
}

// ─── iCal parsing ─────────────────────────────────────────────────────────────

function unfold(ical) {
  return ical.replace(/\r\n[ \t]/g, '').replace(/\n[ \t]/g, '')
}

export function parseVEvents(icalStr) {
  const lines = unfold(icalStr).split(/\r?\n/)
  const events = []
  let current = null

  for (const line of lines) {
    if (line === 'BEGIN:VEVENT') { current = {}; continue }
    if (line === 'END:VEVENT')   { if (current) events.push(current); current = null; continue }
    if (!current) continue

    const colon = line.indexOf(':')
    if (colon < 0) continue

    const nameAndParams = line.slice(0, colon)
    const value = line.slice(colon + 1)
    const parts = nameAndParams.split(';')
    const name = parts[0].toUpperCase()
    const params = {}
    for (let i = 1; i < parts.length; i++) {
      const eq = parts[i].indexOf('=')
      if (eq >= 0) params[parts[i].slice(0, eq).toUpperCase()] = parts[i].slice(eq + 1)
    }

    if (name === 'ATTENDEE') {
      if (!current[name]) current[name] = []
      current[name].push({ value, params })
    } else {
      current[name] = { value, params }
    }
  }

  return events
}

export function normalizeEvent(props, uid) {
  const summary     = props['SUMMARY']?.value ?? ''
  const location    = props['LOCATION']?.value ?? ''
  const description = props['DESCRIPTION']?.value?.replace(/\\n/g, '\n').replace(/\\,/g, ',') ?? ''
  const status      = props['STATUS']?.value ?? 'CONFIRMED'
  const rrule       = props['RRULE']?.value ?? null

  const rawStart = props['DTSTART']
  const rawEnd   = props['DTEND']
  const allDay   = rawStart?.params?.VALUE === 'DATE' || (rawStart?.value && /^\d{8}$/.test(rawStart.value))

  const start = rawStart ? formatICalDate(rawStart.value, rawStart.params?.TZID) : null
  const end   = rawEnd   ? formatICalDate(rawEnd.value,   rawEnd.params?.TZID)   : null

  const attendees = (props['ATTENDEE'] ?? [])
    .map(a => a.value.replace(/^mailto:/i, ''))
    .filter(Boolean)

  const event = { uid, summary, start, end, allDay, location, description, attendees, status }
  if (rrule) event.rrule = rrule
  return event
}

export function normalizeEventDetail(props, uid) {
  const base = normalizeEvent(props, uid)
  const created      = props['CREATED']?.value      ? formatICalDate(props['CREATED'].value)       : null
  const lastModified = props['LAST-MODIFIED']?.value ? formatICalDate(props['LAST-MODIFIED'].value) : null
  if (created)      base.created = created
  if (lastModified) base.lastModified = lastModified
  return base
}

function formatICalDate(value, tzid) {
  if (!value) return null
  if (/^\d{8}$/.test(value)) {
    return `${value.slice(0,4)}-${value.slice(4,6)}-${value.slice(6,8)}`
  }
  if (value.endsWith('Z')) {
    return value.replace(/(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z/, '$1-$2-$3T$4:$5:$6Z')
  }
  const s = value.replace(/(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})/, '$1-$2-$3T$4:$5:$6')
  return tzid ? `${s} (${tzid})` : s
}

// ─── iCal generation ──────────────────────────────────────────────────────────

export function generateUID() {
  return randomUUID()
}

export function icalDateProp(propName, value, allDay, timezone) {
  const d = value instanceof Date ? value : new Date(value)

  if (allDay) {
    const y = d.getFullYear()
    const m = String(d.getMonth() + 1).padStart(2, '0')
    const day = String(d.getDate()).padStart(2, '0')
    return `${propName};VALUE=DATE:${y}${m}${day}`
  }

  if (timezone) {
    const pad = n => String(n).padStart(2, '0')
    const local = new Date(d.toLocaleString('en-US', { timeZone: timezone }))
    const str = `${local.getFullYear()}${pad(local.getMonth()+1)}${pad(local.getDate())}T${pad(local.getHours())}${pad(local.getMinutes())}${pad(local.getSeconds())}`
    return `${propName};TZID=${timezone}:${str}`
  }

  const utc = d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')
  return `${propName}:${utc}`
}

export function buildVCalendar(veventLines) {
  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//saturday//calendar//EN',
    'BEGIN:VEVENT',
    ...veventLines,
    'END:VEVENT',
    'END:VCALENDAR',
  ].join('\r\n') + '\r\n'
}

export function icalEscape(str) {
  return str.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n')
}

// ─── Raw-line helpers for lossless update ─────────────────────────────────────

/** Returns raw property lines from the first VEVENT in an iCal string. */
export function getRawVEventLines(icalStr) {
  const lines = unfold(icalStr).split(/\r?\n/)
  const start = lines.findIndex(l => l === 'BEGIN:VEVENT')
  const end   = lines.findIndex(l => l === 'END:VEVENT')
  if (start < 0 || end < 0) return []
  return lines.slice(start + 1, end).filter(Boolean)
}

/** Replaces the first line for the given property name, or appends if absent. Mutates in place. */
export function replaceOrAddProp(lines, propName, newLine) {
  const upper = propName.toUpperCase()
  const idx = lines.findIndex(l => l.split(':')[0].split(';')[0].toUpperCase() === upper)
  if (idx >= 0) lines.splice(idx, 1, newLine)
  else lines.push(newLine)
}

/** Removes all lines for the given property name. Mutates in place. */
export function removeProp(lines, propName) {
  const upper = propName.toUpperCase()
  for (let i = lines.length - 1; i >= 0; i--) {
    if (lines[i].split(':')[0].split(';')[0].toUpperCase() === upper) lines.splice(i, 1)
  }
}

export function parseAlarms(icalStr) {
  const lines = unfold(icalStr).split(/\r?\n/)
  const alarms = []
  let current = null

  for (const line of lines) {
    if (line === 'BEGIN:VALARM') { current = {}; continue }
    if (line === 'END:VALARM')   { if (current) alarms.push(current); current = null; continue }
    if (!current) continue
    const colon = line.indexOf(':')
    if (colon < 0) continue
    current[line.slice(0, colon).toUpperCase()] = line.slice(colon + 1)
  }

  return alarms.map(a => ({ action: a['ACTION'] ?? '', trigger: a['TRIGGER'] ?? '' }))
}
