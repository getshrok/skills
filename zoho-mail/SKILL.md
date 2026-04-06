---
name: zoho-mail
version: 1.1.0
author: getshrok
description: Read, search, and send Zoho Mail via the Zoho REST API.
---

## Scripts

All scripts are in `$SATURDAY_SKILLS_DIR/zoho-mail/` and output JSON to stdout.

- `folders.mjs` — list mailbox folders with unread/total counts
- `read.mjs` — fetch messages from a folder (filters: sender, subject, date, unread)
- `search.mjs` — search all folders including archived mail
- `message.mjs` — fetch full message body, headers, and attachments
- `send.mjs` — send or reply via Zoho Mail REST API

Exit codes: 0 success, 1 usage, 2 auth, 3 connection, 4 not found.

## Auth

All scripts authenticate via OAuth2. Pass credentials as env vars:

```bash
ZOHO_CLIENT_ID=... ZOHO_CLIENT_SECRET=... ZOHO_REFRESH_TOKEN=... ZOHO_ACCOUNT_ID=... ZOHO_FROM_ADDRESS=... \
  node $SATURDAY_SKILLS_DIR/zoho-mail/read.mjs
```

Credentials are stored in this skill's `MEMORY.md`.

## Setup

If credentials are missing, walk the user through:

1. **Create a Self Client** at https://api-console.zoho.com → Add Client → Self Client. Gives `ZOHO_CLIENT_ID` and `ZOHO_CLIENT_SECRET`.
2. **Generate a grant token** in the Self Client → Generate Code tab. Scope: `ZohoMail.messages.READ,ZohoMail.messages.CREATE,ZohoMail.accounts.READ`. Duration: max.
3. **Exchange for refresh token** — `POST https://accounts.zoho.com/oauth/v2/token` with client_id, client_secret, grant_type=authorization_code, code=GRANT_TOKEN, redirect_uri=https://zoho.com. Save the `refresh_token`.
4. **Get account ID** — `GET https://mail.zoho.com/api/accounts` with `Authorization: Zoho-oauthtoken ACCESS_TOKEN`. Save `accountId` and `primaryEmailAddress`.
5. **Save to MEMORY.md** — all five values: `ZOHO_CLIENT_ID`, `ZOHO_CLIENT_SECRET`, `ZOHO_REFRESH_TOKEN`, `ZOHO_ACCOUNT_ID`, `ZOHO_FROM_ADDRESS`.

No SMTP, no app passwords — OAuth handles everything.
