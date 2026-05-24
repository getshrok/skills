---
name: zoho-cliq
description: Read and send Zoho Cliq messages via the Zoho REST API. Supports DMs, group chats, and channels.
---

Run `node $SHROK_SKILLS_DIR/zoho-cliq/<script>.mjs --help` for available commands and options.

## Auth

Credentials are **stored in `.zoho-credentials.json`** (chmod 600), keyed by a short account
alias. **You never type secrets for normal use** — select an account with `--account <alias>`
(or `-a`) and the scripts load the secret themselves. The committed `.zoho-credentials.json` shows
the **example shape** — use it; don't invent your own. Manage accounts with `creds.mjs`:

```bash
node $SHROK_SKILLS_DIR/zoho-cliq/creds.mjs list                  # masked fingerprints, no secrets
node $SHROK_SKILLS_DIR/zoho-cliq/creds.mjs set <alias> --label L --client-id ID --client-secret S --refresh-token T
node $SHROK_SKILLS_DIR/zoho-cliq/creds.mjs set <alias> --stdin   # read JSON from stdin
node $SHROK_SKILLS_DIR/zoho-cliq/creds.mjs set-default <alias>
node $SHROK_SKILLS_DIR/zoho-cliq/creds.mjs remove <alias>
```

`set` updates only the fields you pass; verify with `creds list` (last-4 + length only). Default
send chat: pass `--chat-id` or set `ZOHO_CLIQ_CHAT_ID`. **Escape hatch:** if
`ZOHO_CLIENT_ID`+`ZOHO_CLIENT_SECRET`+`ZOHO_REFRESH_TOKEN` env vars are all set, they override the store.

Required scopes: `ZohoCliq.Messages.READ,ZohoCliq.Messages.CREATE,ZohoCliq.Chats.READ,ZohoCliq.Channels.READ,ZohoCliq.Webhooks.CREATE`

## Notes

- `unread.mjs` fetches messages newer than a given `--since` timestamp across all chats and channels. Pass the timestamp from the calling skill's tracking state.
- `messages.mjs` fetches messages from a single chat and supports `--since` for incremental polling, or `--before <messageId>` for older-message pagination.
- `--since` accepts ISO 8601 (naked ISO is interpreted in the local timezone), `today`, `yesterday`, `next <weekday>`, or `N days/weeks/months ago`. All timestamps in script output use ISO 8601 with the local timezone offset (e.g. `2026-05-21T10:30:00-04:00`) — never raw UTC.
- The Cliq REST API does not expose a read/unread flag for DM chats — only channels have `unread_count`. For chats, `unread.mjs` uses `last_modified_time` as a proxy (any chat with activity since `--since` is fetched).
- `ZOHO_CLIQ_CHAT_ID` is the default for `send.mjs`. It accepts both numeric DM IDs and `CT_...` channel IDs.
- `chats.mjs` is available for one-off lookups.
