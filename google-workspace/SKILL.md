---
name: google-workspace
description: Work with Google Drive, Docs, and Sheets — list, read, create, edit, and share files. Use when the user needs to interact with their Google Workspace.
---

## Scripts

- `gw.mjs` — All Google Workspace operations. CLI for all Google Workspace operations. Run via bash: `node gw.mjs <command> [options]`.

## First-time setup

Uses the same Google OAuth2 flow as the Gmail skill. If Gmail is already configured with the same Google account, you can reuse the same Client ID and Secret — just need a new token with broader scopes.

1. Write `GW_CLIENT_ID` and `GW_CLIENT_SECRET` to MEMORY.md (or reuse Gmail's if same Google Cloud project)
2. Run `gw.mjs auth-url` — send the URL to the user to visit
3. User provides the code from the redirect URL
4. Run `gw.mjs auth-exchange <code>` — write the returned `refresh_token` as `GW_REFRESH_TOKEN` to MEMORY.md

## MEMORY.md format

```
GW_CLIENT_ID=...
GW_CLIENT_SECRET=...
GW_REFRESH_TOKEN=...
```

## Reading Google Docs and Sheets

The simplest way to read content is via Drive export — no need to parse structured API responses:
- `gw.mjs export <fileId> --format text` — Google Doc as plain text
- `gw.mjs export <fileId> --format csv` — Google Sheet as CSV (first sheet)
- `gw.mjs export <fileId> --format pdf` — any Google file as PDF

For cell-level Sheet reads, use `gw.mjs read-range`.
