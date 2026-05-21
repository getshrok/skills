---
name: zoho-calendar
description: Read, create, update, and delete Zoho Calendar events via the Zoho REST API.
---

Run `node $SHROK_SKILLS_DIR/zoho-calendar/<script>.mjs --help` for available commands and options.

## Auth

Credentials are stored in this skill's `MEMORY.md`:

`ZOHO_CLIENT_ID`, `ZOHO_CLIENT_SECRET`, `ZOHO_REFRESH_TOKEN`

Required scopes: `ZohoCalendar.calendar.READ,ZohoCalendar.event.ALL`

If the user already has Zoho Mail set up, they can reuse the same client ID and secret — just generate a new grant token with calendar scopes.

## Time

`--from` / `--to` accept ISO 8601 (naked ISO is interpreted in the local timezone), `today`, `yesterday`, `tomorrow`, `next <weekday>`, `in N days/weeks/months`, or `N days/weeks/months ago`. Event `start`, `end`, `createdAt`, and `updatedAt` fields in script output are ISO 8601 with the local timezone offset (e.g. `2026-05-21T10:30:00-04:00`) — never raw UTC. All-day events use `YYYY-MM-DD`. The event's original timezone (when set by Zoho) is preserved in the `timezone` field.
