---
name: calendar
description: Read, create, update, and delete calendar events via CalDAV.
npm-deps:
  - tsdav
---

## Scripts

All scripts are in `$SHROK_SKILLS_DIR/calendar/` and output JSON to stdout. Run any script with `--help` for usage.

All date flags accept ISO 8601, relative (`today`, `tomorrow`), natural (`next monday`), and offset (`in 3 days`).

## Auth

Two auth methods: `CALDAV_AUTH_METHOD=basic` or `CALDAV_AUTH_METHOD=oauth`. CalDAV uses a single protocol but providers differ on whether they require basic auth or OAuth — this is not obvious from the provider docs alone.

**Basic:** `CALDAV_URL`, `CALDAV_USER`, `CALDAV_PASS`
**OAuth:** `CALDAV_URL`, `CALDAV_TOKEN_URL`, `CALDAV_CLIENT_ID`, `CALDAV_CLIENT_SECRET`, `CALDAV_REFRESH_TOKEN`

Save all credentials to MEMORY.md when configured.
