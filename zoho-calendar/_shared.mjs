// _shared.mjs — Shared utilities for zoho-calendar scripts.

export const EXIT = {
  OK:         0,
  USAGE:      1,
  AUTH:       2,
  CONNECTION: 3,
  NOT_FOUND:  4,
  CONFLICT:   5,
}

import { readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

function tokenCachePath() {
  return join(tmpdir(), 'zoho-calendar-token.json')
}

function readCachedToken() {
  try {
    const { token, expiresAt } = JSON.parse(readFileSync(tokenCachePath(), 'utf8'))
    if (Date.now() < expiresAt - 5 * 60 * 1000) return token
  } catch { /* no cache */ }
  return null
}

function writeCachedToken(token, expiresIn) {
  try {
    writeFileSync(tokenCachePath(), JSON.stringify({ token, expiresAt: Date.now() + expiresIn * 1000 }))
  } catch { /* best effort */ }
}

export async function getAccessToken() {
  const cached = readCachedToken()
  if (cached) return cached

  const { ZOHO_CLIENT_ID, ZOHO_CLIENT_SECRET, ZOHO_REFRESH_TOKEN } = process.env
  if (!ZOHO_CLIENT_ID)     { console.error('ZOHO_CLIENT_ID is not set');     process.exit(EXIT.AUTH) }
  if (!ZOHO_CLIENT_SECRET) { console.error('ZOHO_CLIENT_SECRET is not set'); process.exit(EXIT.AUTH) }
  if (!ZOHO_REFRESH_TOKEN) { console.error('ZOHO_REFRESH_TOKEN is not set'); process.exit(EXIT.AUTH) }

  const res = await fetch('https://accounts.zoho.com/oauth/v2/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type:    'refresh_token',
      client_id:     ZOHO_CLIENT_ID,
      client_secret: ZOHO_CLIENT_SECRET,
      refresh_token: ZOHO_REFRESH_TOKEN,
    }),
  })

  if (!res.ok) {
    console.error(`Token refresh failed (${res.status}): ${await res.text()}`)
    process.exit(EXIT.AUTH)
  }

  const data = await res.json()
  if (!data.access_token) {
    console.error('Token refresh missing access_token:', JSON.stringify(data))
    process.exit(EXIT.AUTH)
  }

  writeCachedToken(data.access_token, data.expires_in ?? 3600)
  return data.access_token
}

const BASE = 'https://calendar.zoho.com/api/v1'

export async function zohoGet(path, token) {
  let res
  try {
    res = await fetch(`${BASE}${path}`, {
      headers: { Authorization: `Zoho-oauthtoken ${token}` },
    })
  } catch (err) {
    console.error(`Connection error: ${err.message}`)
    process.exit(EXIT.CONNECTION)
  }
  if (res.status === 401 || res.status === 403) {
    console.error(`Auth error (${res.status})`)
    process.exit(EXIT.AUTH)
  }
  if (!res.ok) {
    console.error(`API error (${res.status}): ${await res.text()}`)
    process.exit(EXIT.CONNECTION)
  }
  return res.json()
}

export async function zohoPost(path, token, body) {
  // Zoho Calendar API expects form-encoded params with JSON values, not a JSON body
  const params = new URLSearchParams()
  for (const [k, v] of Object.entries(body)) {
    params.set(k, typeof v === 'string' ? v : JSON.stringify(v))
  }
  let res
  try {
    res = await fetch(`${BASE}${path}`, {
      method: 'POST',
      headers: {
        Authorization: `Zoho-oauthtoken ${token}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: params,
    })
  } catch (err) {
    console.error(`Connection error: ${err.message}`)
    process.exit(EXIT.CONNECTION)
  }
  if (res.status === 401 || res.status === 403) {
    console.error(`Auth error (${res.status})`)
    process.exit(EXIT.AUTH)
  }
  if (!res.ok) {
    console.error(`API error (${res.status}): ${await res.text()}`)
    process.exit(EXIT.CONNECTION)
  }
  return res.json()
}

export async function zohoPut(path, token, body, etag) {
  const params = new URLSearchParams()
  for (const [k, v] of Object.entries(body)) {
    params.set(k, typeof v === 'string' ? v : JSON.stringify(v))
  }
  const headers = {
    Authorization: `Zoho-oauthtoken ${token}`,
    'Content-Type': 'application/x-www-form-urlencoded',
  }
  if (etag) headers['etag'] = etag

  let res
  try {
    res = await fetch(`${BASE}${path}`, { method: 'PUT', headers, body: params })
  } catch (err) {
    console.error(`Connection error: ${err.message}`)
    process.exit(EXIT.CONNECTION)
  }
  if (res.status === 412) {
    console.error('Etag conflict — event was modified externally')
    process.exit(EXIT.CONFLICT)
  }
  if (res.status === 401 || res.status === 403) {
    console.error(`Auth error (${res.status})`)
    process.exit(EXIT.AUTH)
  }
  if (!res.ok) {
    console.error(`API error (${res.status}): ${await res.text()}`)
    process.exit(EXIT.CONNECTION)
  }
  return res.json()
}

export async function zohoDelete(path, token, etag) {
  const headers = { Authorization: `Zoho-oauthtoken ${token}` }
  if (etag) headers['etag'] = etag

  let res
  try {
    res = await fetch(`${BASE}${path}`, { method: 'DELETE', headers })
  } catch (err) {
    console.error(`Connection error: ${err.message}`)
    process.exit(EXIT.CONNECTION)
  }
  if (res.status === 412) {
    console.error('Etag conflict — event was modified externally')
    process.exit(EXIT.CONFLICT)
  }
  if (res.status === 401 || res.status === 403) {
    console.error(`Auth error (${res.status})`)
    process.exit(EXIT.AUTH)
  }
  if (res.status === 404) {
    console.error('Event not found')
    process.exit(EXIT.NOT_FOUND)
  }
  if (!res.ok) {
    console.error(`API error (${res.status}): ${await res.text()}`)
    process.exit(EXIT.CONNECTION)
  }
  return res.json()
}

// ─── Date helpers ────────────────────────────────────────────────────────────

const DAY_NAMES = ['sunday','monday','tuesday','wednesday','thursday','friday','saturday']

export function parseDateArg(value) {
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
  if (isNaN(d.getTime())) {
    console.error(`Invalid date: "${value}"`)
    process.exit(EXIT.USAGE)
  }
  return d
}

function startOfDay(d) {
  d.setHours(0, 0, 0, 0)
  return d
}

/** Format a Date as Zoho's yyyyMMdd string */
export function toZohoDate(d) {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}${m}${day}`
}

/** Format a Date as Zoho's yyyyMMddTHHmmssZ string (UTC) */
export function toZohoDateTime(d) {
  return d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')
}

/** Parse Zoho's dateandtime object into ISO strings */
export function parseZohoDatetime(dt) {
  if (!dt) return { start: null, end: null, timezone: null, allDay: false }
  const tz = dt.timezone ?? null
  const allDay = !dt.start?.includes('T')
  const start = parseSingleZohoDate(dt.start)
  const end = parseSingleZohoDate(dt.end)
  return { start, end, timezone: tz, allDay }
}

function parseSingleZohoDate(s) {
  if (!s) return null
  // All-day: 20260401
  if (/^\d{8}$/.test(s)) return `${s.slice(0,4)}-${s.slice(4,6)}-${s.slice(6,8)}`
  // With offset: 20260407T070000-0400
  const m = s.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})([+-]\d{4})?Z?$/)
  if (m) {
    const iso = `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}`
    if (m[7]) return `${iso}${m[7].slice(0,3)}:${m[7].slice(3)}`
    return `${iso}Z`
  }
  return s
}

/** Normalize a Zoho event response into a clean object */
export function normalizeEvent(e) {
  const dt = parseZohoDatetime(e.dateandtime)
  return {
    uid: e.uid,
    title: e.title ?? '',
    start: dt.start,
    end: dt.end,
    allDay: dt.allDay,
    timezone: dt.timezone,
    location: e.location ?? '',
    description: e.description ?? '',
    attendees: (e.attendees ?? []).map(a => a.email).filter(Boolean),
    organizer: e.organizer ?? '',
    isRecurring: !!e.rrule || !!e.recurrenceid,
    etag: e.etag ?? null,
    calendarUid: e.caluid ?? '',
    createdAt: parseSingleZohoDate(e.createdtime) ?? '',
    updatedAt: parseSingleZohoDate(e.lastmodifiedtime) ?? '',
  }
}
