// _shared.mjs — Shared utilities for zoho-workdrive scripts.

export const EXIT = { OK: 0, USAGE: 1, AUTH: 2, CONNECTION: 3, NOT_FOUND: 4 }

import { readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const CACHE_PATH = join(tmpdir(), 'zoho-workdrive-token.json')

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

export function requireTeamId() {
  const id = process.env.ZOHO_WORKDRIVE_TEAM_ID
  if (!id) { console.error('ZOHO_WORKDRIVE_TEAM_ID is not set'); process.exit(EXIT.AUTH) }
  return id
}

const BASE = 'https://workdrive.zoho.com/api/v1'

export async function wdGet(path, token) {
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
  return res.json()
}
