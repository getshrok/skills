---
name: zoho-mail
description: Read, search, and send Zoho Mail via the Zoho REST API.
---

Run `node $SHROK_SKILLS_DIR/zoho-mail/<script>.mjs --help` for available commands and options.

## Auth

Credentials are stored in this skill's `MEMORY.md`:

`ZOHO_CLIENT_ID`, `ZOHO_CLIENT_SECRET`, `ZOHO_REFRESH_TOKEN`, `ZOHO_ACCOUNT_ID`, `ZOHO_FROM_ADDRESS`

Required scopes: `ZohoMail.messages.READ,ZohoMail.messages.CREATE,ZohoMail.accounts.READ`
