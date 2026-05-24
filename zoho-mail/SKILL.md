---
name: zoho-mail
description: Read, search, and send Zoho Mail via the Zoho REST API.
---

Run `node $SHROK_SKILLS_DIR/zoho-mail/<script>.mjs --help` for available commands and options.

## Auth

Credentials are **stored in `.zoho-credentials.json`** (chmod 600), keyed by a short account
alias. **You never type secrets for normal use** — select an account with `--account <alias>`
(or `-a`). The non-secret `account_id` and `from_address` live in the account entry too. The
committed `.zoho-credentials.json` shows the **example shape** — use it. Manage with `creds.mjs`:

```bash
node $SHROK_SKILLS_DIR/zoho-mail/creds.mjs list                  # masked secrets; account_id/from_address shown
node $SHROK_SKILLS_DIR/zoho-mail/creds.mjs set <alias> --client-id ID --client-secret S --refresh-token T --account-id ID --from-address you@x.com
node $SHROK_SKILLS_DIR/zoho-mail/creds.mjs set <alias> --stdin
node $SHROK_SKILLS_DIR/zoho-mail/creds.mjs set-default <alias>
node $SHROK_SKILLS_DIR/zoho-mail/creds.mjs remove <alias>
```

`set` updates only the fields you pass; verify with `creds list`. **Escape hatch:** if
`ZOHO_CLIENT_ID`+`ZOHO_CLIENT_SECRET`+`ZOHO_REFRESH_TOKEN` env vars are all set, they override the
store (`account_id` falls back to `ZOHO_ACCOUNT_ID` env).

Required scopes: `ZohoMail.messages.READ,ZohoMail.messages.CREATE,ZohoMail.accounts.READ`

## Time

`--since` accepts ISO 8601 (naked ISO is interpreted in the local timezone), `today`, `yesterday`, `next <weekday>`, `in N days/weeks/months`, or `N days/weeks/months ago`. All `date` fields in script output are ISO 8601 with the local timezone offset (e.g. `2026-05-21T10:30:00-04:00`) — never raw UTC.
