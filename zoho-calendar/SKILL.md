---
name: zoho-calendar
description: Read, create, update, and delete Zoho Calendar events via the Zoho REST API.
---

Run `node $SHROK_SKILLS_DIR/zoho-calendar/<script>.mjs --help` for available commands and options.

## Auth & accounts

Credentials are **stored in `.zoho-credentials.json`** (chmod 600), keyed by a short account
alias. **You never type secrets for normal use** — select an account with `--account <alias>`
(or `-a`), and the scripts load the secret themselves:

```bash
node $SHROK_SKILLS_DIR/zoho-calendar/events.mjs --account ashley --from today
node $SHROK_SKILLS_DIR/zoho-calendar/calendars.mjs -a ashley
```

If `--account` is omitted and there's no default and more than one account exists, the script
errors and lists the aliases. Why aliases: refresh tokens are long opaque strings that are easy
to mis-copy — the alias keeps the secret inside the script.

The committed `.zoho-credentials.json` shows the **example shape** (placeholder values) — use it as
the structure; don't invent your own.

Required scopes: `ZohoCalendar.calendar.READ,ZohoCalendar.event.ALL`. If the user already has
another Zoho skill set up, they can reuse the same client ID/secret — just generate a grant token
with calendar scopes.

### Managing credentials

Only when explicitly storing/changing/deleting credentials — not for normal calendar ops:

```bash
node $SHROK_SKILLS_DIR/zoho-calendar/creds.mjs list                  # accounts + masked fingerprints (no secrets)
node $SHROK_SKILLS_DIR/zoho-calendar/creds.mjs set <alias> --label L --client-id ID --client-secret S --refresh-token T
node $SHROK_SKILLS_DIR/zoho-calendar/creds.mjs set <alias> --stdin   # read {label,client_id,client_secret,refresh_token} JSON from stdin
node $SHROK_SKILLS_DIR/zoho-calendar/creds.mjs set-default <alias>
node $SHROK_SKILLS_DIR/zoho-calendar/creds.mjs remove <alias>
```

`set` updates only the fields you pass; verify with `creds list` (shows last-4 + length, never the
full secret). **Escape hatch:** if `ZOHO_CLIENT_ID`+`ZOHO_CLIENT_SECRET`+`ZOHO_REFRESH_TOKEN` are
all set as env vars, they override the store (one-off testing).

## Time

`--from` / `--to` accept ISO 8601 (naked ISO is interpreted in the local timezone), `today`, `yesterday`, `tomorrow`, `next <weekday>`, `in N days/weeks/months`, or `N days/weeks/months ago`. Event `start`, `end`, `createdAt`, and `updatedAt` fields in script output are ISO 8601 with the local timezone offset (e.g. `2026-05-21T10:30:00-04:00`) — never raw UTC. All-day events use `YYYY-MM-DD`. The event's original timezone (when set by Zoho) is preserved in the `timezone` field.
