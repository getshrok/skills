// _shared.mjs — Shared utilities for email scripts.

import { ImapFlow } from 'imapflow'

export const EXIT = {
  OK:         0,
  USAGE:      1,
  AUTH:       2,
  CONNECTION: 3,
  NOT_FOUND:  4,
}

export function makeClient() {
  const {
    IMAP_HOST, IMAP_PORT, IMAP_USER, IMAP_PASS,
  } = process.env

  if (!IMAP_HOST) { console.error('IMAP_HOST is not set'); process.exit(EXIT.AUTH) }
  if (!IMAP_USER) { console.error('IMAP_USER is not set'); process.exit(EXIT.AUTH) }
  if (!IMAP_PASS) { console.error('IMAP_PASS is not set'); process.exit(EXIT.AUTH) }

  return new ImapFlow({
    host: IMAP_HOST,
    port: parseInt(IMAP_PORT ?? '993', 10),
    secure: true,
    auth: { user: IMAP_USER, pass: IMAP_PASS },
    logger: false,
  })
}

const DAY_NAMES = ['sunday','monday','tuesday','wednesday','thursday','friday','saturday']

/**
 * Parse a date argument. Accepts ISO 8601, relative expressions
 * (today, tomorrow, yesterday, next <weekday>, in N days/weeks/months, N units ago).
 * Returns a Date object; exits with USAGE on invalid input.
 */
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
