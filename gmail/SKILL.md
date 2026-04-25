---
name: gmail
description: "Read, search, send, and organize Gmail messages."
---

## Scripts

- `gmail.mjs` — All Gmail operations. CLI for all Gmail operations. Run via bash: `node gmail.mjs <command> [options]`.

## Credentials

Credentials are **required as environment variables** at invocation time — the script will immediately error without them.

```bash
GMAIL_CLIENT_ID=... GMAIL_CLIENT_SECRET=... GMAIL_REFRESH_TOKEN=... node gmail.mjs <command>
```

## Token Cache

Access tokens are cached in `.token-cache` (JSON, gitignored) and keyed by `GMAIL_CLIENT_ID`, so multiple accounts cache independently without collision. Tokens are reused until 60 seconds before expiry, then refreshed automatically. You do not need to manage this manually.
