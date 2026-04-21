// _shared.mjs — Shared utilities for zoho-mail scripts.

export const EXIT = {
  OK:         0,
  USAGE:      1,
  AUTH:       2,
  CONNECTION: 3,
  NOT_FOUND:  4,
}

// Token cache — persisted to a temp file to avoid refreshing on every script invocation.
// Zoho access tokens are valid for ~1 hour. We refresh 5 minutes early to be safe.
import { readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

function tokenCachePath() {
  const accountId = process.env.ZOHO_ACCOUNT_ID ?? 'default'
  return join(tmpdir(), `zoho-token-${accountId}.json`)
}

function readCachedToken() {
  try {
    const { token, expiresAt } = JSON.parse(readFileSync(tokenCachePath(), 'utf8'))
    if (Date.now() < expiresAt - 5 * 60 * 1000) return token // valid with 5min buffer
  } catch { /* no cache */ }
  return null
}

function writeCachedToken(token, expiresIn) {
  try {
    writeFileSync(tokenCachePath(), JSON.stringify({ token, expiresAt: Date.now() + expiresIn * 1000 }))
  } catch { /* best effort */ }
}

/**
 * Get a valid Zoho OAuth access token, refreshing only when expired.
 * Caches the token to disk so multiple script calls don't hammer the token endpoint.
 */
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

/**
 * Make an authenticated GET request to the Zoho Mail API.
 * Handles auth errors and connection errors with appropriate exit codes.
 */
export async function zohoGet(path, token) {
  const base = `https://mail.zoho.com/api/accounts/${requireAccountId()}`
  let res
  try {
    res = await fetch(`${base}${path}`, {
      headers: { Authorization: `Zoho-oauthtoken ${token}` },
    })
  } catch (err) {
    console.error(`Connection error: ${err.message}`)
    process.exit(EXIT.CONNECTION)
  }

  if (res.status === 401 || res.status === 403) {
    console.error(`Auth error (${res.status}) — check credentials`)
    process.exit(EXIT.AUTH)
  }

  if (!res.ok) {
    const text = await res.text()
    console.error(`API error (${res.status}): ${text}`)
    process.exit(EXIT.CONNECTION)
  }

  return res.json()
}

export function requireAccountId() {
  const id = process.env.ZOHO_ACCOUNT_ID
  if (!id) { console.error('ZOHO_ACCOUNT_ID is not set'); process.exit(EXIT.AUTH) }
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
    console.error(`Invalid date: "${value}". Use ISO 8601, "today/tomorrow/yesterday", "next <weekday>", "in N days/weeks", or "N days ago".`)
    process.exit(EXIT.USAGE)
  }
  return d
}

function startOfDay(d) {
  d.setHours(0, 0, 0, 0)
  return d
}
