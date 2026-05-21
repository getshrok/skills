// _shared.mjs — Shared utilities for zoho-desk scripts.

export const EXIT = {
  OK:         0,
  USAGE:      1,
  AUTH:       2,
  CONNECTION: 3,
  NOT_FOUND:  4,
}

import { readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const CACHE_PATH = join(tmpdir(), 'zoho-desk-token.json')

function readCachedToken() {
  try {
    const { token, expiresAt } = JSON.parse(readFileSync(CACHE_PATH, 'utf8'))
    if (Date.now() < expiresAt - 5 * 60 * 1000) return token
  } catch { /* no cache */ }
  return null
}

function writeCachedToken(token, expiresIn) {
  try {
    writeFileSync(CACHE_PATH, JSON.stringify({ token, expiresAt: Date.now() + expiresIn * 1000 }))
  } catch { /* best effort */ }
}

export async function getAccessToken() {
  const cached = readCachedToken()
  if (cached) return cached

  const { ZOHO_CLIENT_ID, ZOHO_CLIENT_SECRET, ZOHO_DESK_REFRESH_TOKEN } = process.env
  if (!ZOHO_CLIENT_ID)             { console.error('ZOHO_CLIENT_ID is not set');             process.exit(EXIT.AUTH) }
  if (!ZOHO_CLIENT_SECRET)         { console.error('ZOHO_CLIENT_SECRET is not set');         process.exit(EXIT.AUTH) }
  if (!ZOHO_DESK_REFRESH_TOKEN)    { console.error('ZOHO_DESK_REFRESH_TOKEN is not set');    process.exit(EXIT.AUTH) }

  const res = await fetch('https://accounts.zoho.com/oauth/v2/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type:    'refresh_token',
      client_id:     ZOHO_CLIENT_ID,
      client_secret: ZOHO_CLIENT_SECRET,
      refresh_token: ZOHO_DESK_REFRESH_TOKEN,
    }),
  })

  if (!res.ok) {
    const text = await res.text()
    console.error(`Token refresh failed (${res.status}): ${text}`)
    process.exit(EXIT.AUTH)
  }

  const data = await res.json()
  if (!data.access_token) {
    console.error('Token refresh response missing access_token:', JSON.stringify(data))
    process.exit(EXIT.AUTH)
  }

  writeCachedToken(data.access_token, data.expires_in ?? 3600)
  return data.access_token
}

export function requireOrgId() {
  const id = process.env.ZOHO_DESK_ORG_ID
  if (!id) { console.error('ZOHO_DESK_ORG_ID is not set'); process.exit(EXIT.AUTH) }
  return id
}

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

  const d = new Date(s)
  if (isNaN(d.getTime())) {
    console.error(`Invalid date: "${value}". Use ISO 8601, "today/yesterday", "next <weekday>", or "N days/weeks/months ago".`)
    process.exit(EXIT.USAGE)
  }
  return d
}

function startOfDay(d) {
  d.setHours(0, 0, 0, 0)
  return d
}

// Format a Date as ISO 8601 with the system's local timezone offset
// (e.g. "2026-05-21T10:30:00-04:00"). Returns null for invalid dates.
export function toLocalISO(d) {
  if (!d || isNaN(d.getTime())) return null
  const pad = (n, w = 2) => String(n).padStart(w, '0')
  const tz = -d.getTimezoneOffset()
  const sign = tz >= 0 ? '+' : '-'
  const absTz = Math.abs(tz)
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T` +
         `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}` +
         `${sign}${pad(Math.floor(absTz / 60))}:${pad(absTz % 60)}`
}

const BASE = 'https://desk.zoho.com/api/v1'

export async function deskGet(path, token, orgId) {
  let res
  try {
    res = await fetch(`${BASE}${path}`, {
      headers: {
        Authorization: `Zoho-oauthtoken ${token}`,
        orgId,
      },
    })
  } catch (err) {
    console.error(`Connection error: ${err.message}`)
    process.exit(EXIT.CONNECTION)
  }
  if (res.status === 401 || res.status === 403) {
    console.error(`Auth error (${res.status}) — check credentials and scopes`)
    process.exit(EXIT.AUTH)
  }
  if (res.status === 404) {
    console.error('Not found')
    process.exit(EXIT.NOT_FOUND)
  }
  if (!res.ok) {
    const text = await res.text()
    console.error(`API error (${res.status}): ${text}`)
    process.exit(EXIT.CONNECTION)
  }
  if (res.status === 204) return { data: [] }
  const text = await res.text()
  return text ? JSON.parse(text) : { data: [] }
}
