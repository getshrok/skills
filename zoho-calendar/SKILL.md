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
