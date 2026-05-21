---
name: zoho-desk
description: Read and search Zoho Desk tickets and email threads via the Zoho REST API.
---

Run `node $SHROK_SKILLS_DIR/zoho-desk/<script>.mjs --help` for available commands and options.

## Auth

Credentials are stored in this skill's `MEMORY.md`:

`ZOHO_CLIENT_ID`, `ZOHO_CLIENT_SECRET`, `ZOHO_DESK_REFRESH_TOKEN`, `ZOHO_DESK_ORG_ID`, `ZOHO_DESK_DEPT_ID`

Required scopes: `Desk.tickets.READ,Desk.contacts.READ,Desk.basic.READ,Desk.agents.READ,Desk.search.READ`

## Notes

- `tickets.mjs` defaults to the department in `ZOHO_DESK_DEPT_ID`. Pass `--dept-id` to override, or unset the env var to query across all departments. Supports `--status` (e.g. `Open`, `Closed`, `On Hold`), `--search` for full-text search, and `--since` for incremental polling.
- `--since` accepts ISO 8601 (naked ISO is interpreted in the local timezone), `today`, `yesterday`, `next <weekday>`, or `N days/weeks/months ago`. Filters by `modifiedTime`. The Desk list endpoint has no server-side modifiedTime filter, so this is applied client-side after a wider server fetch.
- `ticket.mjs` fetches a single ticket by ID. Use `--threads` to include email thread content, `--comments` for agent notes.
- All timestamps in script output use ISO 8601 with the local timezone offset (e.g. `2026-05-21T10:30:00-04:00`) — never raw UTC.
- Contact names are included when available; some older tickets show a raw contact ID if the name wasn't stored in Zoho.
