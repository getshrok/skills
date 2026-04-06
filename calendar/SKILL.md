---
name: calendar
version: 1.1.0
author: getshrok
description: Read, create, update, and delete calendar events via CalDAV.
npm-deps:
  - tsdav
---

## Scripts

All scripts are in `$SATURDAY_SKILLS_DIR/calendar/` and output JSON to stdout.

- `calendars.mjs` — list available calendars
- `events.mjs` — list or search events in a date range
- `event.mjs` — get full detail for a single event by UID
- `create.mjs` — create an event
- `update.mjs` — update an event (etag-checked to prevent conflicts)
- `delete.mjs` — delete an event by UID

Run with `--help` for flags. Exit codes: 0 success, 1 usage, 2 auth, 3 connection, 4 not found, 5 etag conflict.

All date flags accept ISO 8601, relative (`today`, `tomorrow`), natural (`next monday`), and offset (`in 3 days`).

## Auth

Set `CALDAV_AUTH_METHOD` to `basic` or `oauth`. Pass credentials as env vars. Credentials are stored in this skill's `MEMORY.md`.

**Basic:** `CALDAV_URL`, `CALDAV_USER`, `CALDAV_PASS`
**OAuth:** `CALDAV_URL`, `CALDAV_TOKEN_URL`, `CALDAV_CLIENT_ID`, `CALDAV_CLIENT_SECRET`, `CALDAV_REFRESH_TOKEN`

## Setup

If credentials are missing, walk the user through connecting their calendar provider:

- **Google Calendar:** OAuth with `CALDAV_URL=https://apidata.googleusercontent.com/caldav/v2/<email>/`. Needs a Google Cloud OAuth client.
- **iCloud:** Basic auth with `CALDAV_URL=https://caldav.icloud.com/`. Needs an app-specific password from appleid.apple.com.
- **Zoho/Fastmail/other CalDAV:** Basic or OAuth depending on provider. Ask the user for their CalDAV URL.

Save all credentials to MEMORY.md when done.
