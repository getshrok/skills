---
name: google-workspace
description: Work with Google Drive, Docs, and Sheets — list, read, create, edit, and share files. Use when the user needs to interact with their Google Workspace.
---

## Scripts

- `gw.mjs` — All Google Workspace operations. CLI for all Google Workspace operations. Run via bash: `node gw.mjs <command> [options]`.

## Credentials & accounts

Secrets are **stored in `.google-workspace-credentials.json`** (chmod 600), keyed by a short
account alias. **You never type secrets for normal use** — select an account with `--account
<alias>` (or `-a`); the script loads the secret itself. The committed
`.google-workspace-credentials.json` shows the **example shape** — use it, don't invent your own.

```bash
node $SHROK_SKILLS_DIR/google-workspace/gw.mjs files --account ashley --max 20
```

Required scopes: `https://www.googleapis.com/auth/drive`, `.../documents`, `.../spreadsheets`.
You can reuse the Gmail/Calendar Google client ID & secret, but the **refresh token must be minted
with these workspace scopes** (a calendar/gmail-scoped token will 403 with
`ACCESS_TOKEN_SCOPE_INSUFFICIENT`).

### Managing credentials

```bash
node $SHROK_SKILLS_DIR/google-workspace/gw.mjs creds list                  # masked fingerprints, no secrets
node $SHROK_SKILLS_DIR/google-workspace/gw.mjs creds set <alias> --email E --client-id ID --client-secret S --refresh-token T
node $SHROK_SKILLS_DIR/google-workspace/gw.mjs creds set <alias> --stdin   # JSON on stdin
node $SHROK_SKILLS_DIR/google-workspace/gw.mjs creds set-default <alias>
node $SHROK_SKILLS_DIR/google-workspace/gw.mjs creds remove <alias>
```

### First-time OAuth (mints the refresh token without copying it)

1. `gw.mjs creds set <alias> --client-id ... --client-secret ...` (reuse Gmail's client if same project)
2. `gw.mjs auth-url --account <alias>` — send the URL to the user to visit
3. User provides the code from the redirect URL
4. `gw.mjs auth-exchange <code> --account <alias>` — writes the `refresh_token` straight into the store

**Escape hatch:** if `GW_CLIENT_ID`+`GW_CLIENT_SECRET`+`GW_REFRESH_TOKEN` env vars are all set, they
override the store (one-off testing).

## Reading Google Docs and Sheets

The simplest way to read content is via Drive export — no need to parse structured API responses:
- `gw.mjs export <fileId> --format text` — Google Doc as plain text
- `gw.mjs export <fileId> --format csv` — Google Sheet as CSV (first sheet)
- `gw.mjs export <fileId> --format pdf` — any Google file as PDF

For cell-level Sheet reads, use `gw.mjs read-range`.
