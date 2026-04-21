---
name: zoho-workdrive
description: Access Aither Health files in Zoho WorkDrive — search, browse, download, and upload files. Use when any task involves company documents stored in WorkDrive.
---

Run `node $SHROK_SKILLS_DIR/zoho-workdrive/<script>.mjs --help` for available options.

## Auth

Credentials and known IDs are in MEMORY.md: `ZOHO_CLIENT_ID`, `ZOHO_CLIENT_SECRET`, `ZOHO_REFRESH_TOKEN`, `ZOHO_WORKDRIVE_TEAM_ID`.

Token refresh and caching is handled automatically by `_shared.mjs`.

## Scripts

| Script | Purpose |
|--------|---------|
| `search.mjs` | Search for files across WorkDrive (`--query`) |
| `list.mjs` | List files in a folder (`--folder-id`) |
| `download.mjs` | Download a file to disk (`--file-id`, `--out`) |
| `upload.mjs` | Upload a local file to a folder (`--folder-id`, `--file`) |
