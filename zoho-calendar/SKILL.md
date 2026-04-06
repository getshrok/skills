---
name: zoho-calendar
description: Read, create, update, and delete Zoho Calendar events via the Zoho REST API.
---

## Scripts

All scripts are in `$SATURDAY_SKILLS_DIR/zoho-calendar/` and output JSON to stdout.

- `calendars.mjs` — list available calendars
- `events.mjs` — list events in a date range
- `event.mjs` — get full detail for a single event by UID
- `create.mjs` — create an event
- `update.mjs` — update an event (etag-checked)
- `delete.mjs` — delete an event by UID

Exit codes: 0 success, 1 usage, 2 auth, 3 connection, 4 not found, 5 etag conflict.

All date flags accept ISO 8601, relative (`today`, `tomorrow`), natural (`next monday`), and offset (`in 3 days`).

## Auth

All scripts use Zoho OAuth2. Pass credentials as env vars. Credentials are stored in this skill's `MEMORY.md`.

Required: `ZOHO_CLIENT_ID`, `ZOHO_CLIENT_SECRET`, `ZOHO_REFRESH_TOKEN`

The refresh token must have scopes: `ZohoCalendar.calendar.READ,ZohoCalendar.event.ALL`

## Setup

If credentials are missing, walk the user through:

1. **Create a Self Client** at https://api-console.zoho.com → Add Client → Self Client. Gives `ZOHO_CLIENT_ID` and `ZOHO_CLIENT_SECRET`.
2. **Generate a grant token** in the Self Client → Generate Code tab. Scope: `ZohoCalendar.calendar.READ,ZohoCalendar.event.ALL`. Duration: max.
3. **Exchange for refresh token** — `POST https://accounts.zoho.com/oauth/v2/token` with client_id, client_secret, grant_type=authorization_code, code=GRANT_TOKEN, redirect_uri=https://zoho.com. Save the `refresh_token`.
4. **Save to MEMORY.md** — `ZOHO_CLIENT_ID`, `ZOHO_CLIENT_SECRET`, `ZOHO_REFRESH_TOKEN`.

If the user already has Zoho Mail set up, they can reuse the same client ID and secret — just generate a new grant token with calendar scopes.
