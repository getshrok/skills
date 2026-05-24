---
name: zoho-workdrive
description: Access files in Zoho WorkDrive — search, browse, download, and upload files. Use when any task involves documents stored in WorkDrive.
---

Run `node $SHROK_SKILLS_DIR/zoho-workdrive/<script>.mjs --help` for available options.

## Auth

Credentials are **stored in `.zoho-credentials.json`** (chmod 600), keyed by a short account
alias. **You never type secrets for normal use** — select an account with `--account <alias>`
(or `-a`). The committed `.zoho-credentials.json` shows the **example shape** — use it. Manage
with `creds.mjs`:

```bash
node $SHROK_SKILLS_DIR/zoho-workdrive/creds.mjs list            # masked secrets; team_id shown
node $SHROK_SKILLS_DIR/zoho-workdrive/creds.mjs set <alias> --client-id ID --client-secret S --refresh-token T --team-id ID
node $SHROK_SKILLS_DIR/zoho-workdrive/creds.mjs set <alias> --stdin
node $SHROK_SKILLS_DIR/zoho-workdrive/creds.mjs set-default <alias>
node $SHROK_SKILLS_DIR/zoho-workdrive/creds.mjs remove <alias>
```

`set` updates only the fields you pass; verify with `creds list`. Token refresh and caching are
handled automatically by `_shared.mjs`. **Escape hatch:** if
`ZOHO_CLIENT_ID`+`ZOHO_CLIENT_SECRET`+`ZOHO_REFRESH_TOKEN` env vars are all set, they override the store.

Required scopes: `WorkDrive.files.ALL` (covers list/search/download reads + upload). Granular
equivalent: `WorkDrive.files.READ,WorkDrive.files.CREATE`.

`team_id` is an **optional** field — the current scripts (`list`/`search`/`download`/`upload`) all
take an explicit `--folder-id`/`--file-id` (get folder IDs from the WorkDrive web URL), so a team
scope is not required. The `--team-id` field and `ZOHO_WORKDRIVE_TEAM_ID` env are kept for
forward-compatibility but are not used by these scripts.

## Scripts

| Script | Purpose |
|--------|---------|
| `search.mjs` | Search for files across WorkDrive (`--query`) |
| `list.mjs` | List files in a folder (`--folder-id`) |
| `download.mjs` | Download a file to disk (`--file-id`, `--out`) |
| `upload.mjs` | Upload a local file to a folder (`--folder-id`, `--file`) |
