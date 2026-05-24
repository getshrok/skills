---
name: zoho-desk
description: Read and search Zoho Desk tickets and email threads via the Zoho REST API.
---

Run `node $SHROK_SKILLS_DIR/zoho-desk/<script>.mjs --help` for available commands and options.

## Auth

Credentials are **stored in `.zoho-credentials.json`** (chmod 600), keyed by a short account
alias. **You never type secrets for normal use** — select an account with `--account <alias>`
(or `-a`). The non-secret `org_id` and `dept_id` live in the account entry too (so the account is
self-contained). The committed `.zoho-credentials.json` shows the **example shape** — use it.
Manage accounts with `creds.mjs`:

```bash
node $SHROK_SKILLS_DIR/zoho-desk/creds.mjs list                  # masked secrets; org_id/dept_id shown
node $SHROK_SKILLS_DIR/zoho-desk/creds.mjs set <alias> --client-id ID --client-secret S --refresh-token T --org-id ID [--dept-id ID]
node $SHROK_SKILLS_DIR/zoho-desk/creds.mjs set <alias> --stdin
node $SHROK_SKILLS_DIR/zoho-desk/creds.mjs set-default <alias>
node $SHROK_SKILLS_DIR/zoho-desk/creds.mjs remove <alias>
```

`set` updates only the fields you pass; verify with `creds list`. **Escape hatch:** if
`ZOHO_CLIENT_ID`+`ZOHO_CLIENT_SECRET`+`ZOHO_DESK_REFRESH_TOKEN` env vars are all set, they override
the store (org/dept ids still read from `ZOHO_DESK_ORG_ID`/`ZOHO_DESK_DEPT_ID` env as fallback).

Required scopes: `Desk.tickets.READ,Desk.contacts.READ,Desk.basic.READ,Desk.agents.READ,Desk.search.READ`

## Notes

- `tickets.mjs` defaults to the department in `ZOHO_DESK_DEPT_ID`. Pass `--dept-id` to override, or unset the env var to query across all departments. Supports `--status` (e.g. `Open`, `Closed`, `On Hold`), `--search` for full-text search, and `--since` for incremental polling.
- `--since` accepts ISO 8601 (naked ISO is interpreted in the local timezone), `today`, `yesterday`, `next <weekday>`, or `N days/weeks/months ago`. Filters by `modifiedTime`. The Desk list endpoint has no server-side modifiedTime filter, so this is applied client-side after a wider server fetch.
- `ticket.mjs` fetches a single ticket by ID. Use `--threads` to include email thread content, `--comments` for agent notes.
- All timestamps in script output use ISO 8601 with the local timezone offset (e.g. `2026-05-21T10:30:00-04:00`) — never raw UTC.
- Contact names are included when available; some older tickets show a raw contact ID if the name wasn't stored in Zoho.
