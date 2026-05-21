---
name: calendar
description: Read, create, update, and delete calendar events via CalDAV.
---

## Scripts

All scripts are in `$SHROK_SKILLS_DIR/calendar/` and output JSON to stdout. Run any script with `--help` for usage.

All date flags accept ISO 8601, relative (`today`, `tomorrow`), natural (`next monday`), and offset (`in 3 days`). Naked ISO timestamps (no offset) are interpreted in the system's local timezone. Event `start` and `end` fields in script output are ISO 8601 with the local timezone offset (e.g. `2026-05-21T10:30:00-04:00`) — never raw UTC. All-day events use `YYYY-MM-DD`. Events with a TZID are converted from their source timezone to the user's local timezone using IANA tz data; the original tz isn't preserved in output (CalDAV doesn't surface it as cleanly as Zoho does).

npm-deps: tsdav

## Auth

Two auth methods: `CALDAV_AUTH_METHOD=basic` or `CALDAV_AUTH_METHOD=oauth`. CalDAV uses a single protocol but providers differ on whether they require basic auth or OAuth — this is not obvious from the provider docs alone.

**Basic:** `CALDAV_URL`, `CALDAV_USER`, `CALDAV_PASS`
**OAuth:** `CALDAV_URL`, `CALDAV_TOKEN_URL`, `CALDAV_CLIENT_ID`, `CALDAV_CLIENT_SECRET`, `CALDAV_REFRESH_TOKEN`

Save all credentials to MEMORY.md when configured.
