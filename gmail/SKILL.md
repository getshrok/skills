---
name: gmail
description: Read, search, send, and organize Gmail messages via the Gmail API with OAuth2 authentication.
---

## Scripts

- `gmail.mjs` — All Gmail operations. Run `gmail.mjs --help` for commands.

## First-time setup

1. Write `GMAIL_CLIENT_ID` and `GMAIL_CLIENT_SECRET` to MEMORY.md
2. Run `gmail.mjs auth-url` — send the URL to the user to visit
3. User provides the code from the redirect URL
4. Run `gmail.mjs auth-exchange <code>` — write the returned `refresh_token` as `GMAIL_REFRESH_TOKEN` to MEMORY.md

## MEMORY.md format

```
GMAIL_CLIENT_ID=...
GMAIL_CLIENT_SECRET=...
GMAIL_REFRESH_TOKEN=...
```
