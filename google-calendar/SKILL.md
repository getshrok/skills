---
name: google-calendar
description: "Read, create, update, and delete Google Calendar events."
---

## Scripts

- `calendar.mjs` — All Calendar operations. CLI for all Google Calendar operations. Run via bash: `node calendar.mjs <command> [options]`.

## Credentials & accounts

Secrets are **stored in `.google-calendar-credentials.json`** (chmod 600), keyed by a short
account alias. **You never type secrets for normal use** — select an account with `--account
<alias>` (or `-a`); the script loads the secret. The committed `.google-calendar-credentials.json`
shows the **example shape** — use it, don't invent your own.

```bash
node $SHROK_SKILLS_DIR/google-calendar/calendar.mjs list --account ashley
```

The refresh token must be authorized with the `https://www.googleapis.com/auth/calendar` scope
(you can reuse the Gmail Google client ID/secret, but the token needs the calendar scope).

### Managing credentials

```bash
node $SHROK_SKILLS_DIR/google-calendar/calendar.mjs creds list                  # masked fingerprints, no secrets
node $SHROK_SKILLS_DIR/google-calendar/calendar.mjs creds set <alias> --email E --client-id ID --client-secret S --refresh-token T
node $SHROK_SKILLS_DIR/google-calendar/calendar.mjs creds set <alias> --stdin   # JSON on stdin
node $SHROK_SKILLS_DIR/google-calendar/calendar.mjs creds set-default <alias>
node $SHROK_SKILLS_DIR/google-calendar/calendar.mjs creds remove <alias>
```

### First-time OAuth (mints the refresh token without copying it)

1. `calendar.mjs creds set <alias> --client-id ... --client-secret ...` (reuse Gmail's client if same project)
2. `calendar.mjs auth-url --account <alias>` — send the URL to the user to visit
3. User provides the code from the redirect URL
4. `calendar.mjs auth-exchange <code> --account <alias>` — writes the `refresh_token` into the store

Token refresh + caching are automatic (cache keyed by client_id + refresh_token).
**Escape hatch:** `GCAL_CLIENT_ID`+`GCAL_CLIENT_SECRET`+`GCAL_REFRESH_TOKEN` env vars override the store.

## Commands

| Command | Description |
|---|---|
| `calendars` | List all calendars available to the account |
| `list` | List upcoming events (supports `--from`, `--to`, `--max`, `--query`, `--calendar`) |
| `get <eventId>` | Get full details for a specific event |
| `create --summary S` | Create a new event (supports `--start`, `--end`, `--description`, `--location`, `--attendees`, `--all-day`) |
| `update <eventId>` | Patch an existing event's fields |
| `delete <eventId>` | Permanently delete an event |
| `quick-add <text>` | Create an event from natural language (e.g. `"Lunch with Sarah tomorrow at noon"`) |

Default calendar is `primary`. Pass `--calendar <calendarId>` to target another calendar.
