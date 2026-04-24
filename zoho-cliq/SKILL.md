---
name: zoho-cliq
description: Read and send Zoho Cliq messages via the Zoho REST API. Supports DMs, group chats, and channels.
---

Run `node $SHROK_SKILLS_DIR/zoho-cliq/<script>.mjs --help` for available commands and options.

## Auth

Credentials are stored in this skill's `MEMORY.md`:

`ZOHO_CLIENT_ID`, `ZOHO_CLIENT_SECRET`, `ZOHO_REFRESH_TOKEN`, `ZOHO_CLIQ_CHAT_ID`

Required scopes: `ZohoCliq.Messages.READ,ZohoCliq.Messages.CREATE,ZohoCliq.Chats.READ,ZohoCliq.Channels.READ,ZohoCliq.Webhooks.CREATE`

## Notes

- `unread.mjs` fetches messages newer than a given `--since <ISO>` timestamp across all chats and channels. Pass the timestamp from the calling skill's tracking state.
- The Cliq REST API does not expose a read/unread flag for DM chats — only channels have `unread_count`. For chats, `unread.mjs` uses `last_modified_time` as a proxy (any chat with activity since `--since` is fetched).
- `ZOHO_CLIQ_CHAT_ID` is the default for `send.mjs`. It accepts both numeric DM IDs and `CT_...` channel IDs.
- `messages.mjs` and `chats.mjs` are available for one-off lookups by chat ID.
