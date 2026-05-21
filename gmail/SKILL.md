---
name: gmail
description: "Read, search, send, and organize Gmail messages."
---

## Scripts

- `gmail.mjs` — All Gmail operations. CLI for all Gmail operations. Run via bash: `node gmail.mjs <command> [options]`.

## Time

`--since` accepts ISO 8601 — a naked ISO timestamp like `2026-05-21T10:00:00` is interpreted in the system's local timezone; add `Z` or `±HH:MM` for an explicit offset. The `list` command filters by Gmail's authoritative `internalDate` (receipt time), so the cutoff is exact. All `date` fields in output are ISO 8601 with the local timezone offset (e.g. `2026-05-21T10:30:00-04:00`) — never raw UTC.

## Credentials

Credentials are **required as environment variables** at invocation time — the script will immediately error without them.

```bash
GMAIL_CLIENT_ID=... GMAIL_CLIENT_SECRET=... GMAIL_REFRESH_TOKEN=... node gmail.mjs <command>
```

## Token Cache

Access tokens are cached in `.token-cache` (JSON, gitignored) and keyed by `GMAIL_CLIENT_ID`, so multiple accounts cache independently without collision. Tokens are reused until 60 seconds before expiry, then refreshed automatically. You do not need to manage this manually.
