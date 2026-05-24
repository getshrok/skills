---
name: calendar
description: Read, create, update, and delete calendar events via CalDAV.
---

## Scripts

All scripts are in `$SHROK_SKILLS_DIR/calendar/` and output JSON to stdout. Run any script with `--help` for usage.

All date flags accept ISO 8601, relative (`today`, `tomorrow`), natural (`next monday`), and offset (`in 3 days`). Naked ISO timestamps (no offset) are interpreted in the system's local timezone. Event `start` and `end` fields in script output are ISO 8601 with the local timezone offset (e.g. `2026-05-21T10:30:00-04:00`) — never raw UTC. All-day events use `YYYY-MM-DD`. Events with a TZID are converted from their source timezone to the user's local timezone using IANA tz data; the original tz isn't preserved in output (CalDAV doesn't surface it as cleanly as Zoho does).

npm-deps: tsdav

## Auth & accounts

Credentials are **stored in `.calendar-credentials.json`** (chmod 600), keyed by a short account
alias. **You never type secrets for normal use** — select an account with `--account <alias>`
(or `-a`); the scripts load the config/secret themselves. The committed
`.calendar-credentials.json` shows the **example shape** (one basic + one oauth account) — use it.

```bash
node $SHROK_SKILLS_DIR/calendar/events.mjs --account home --from today
```

Each account uses one of two auth methods (CalDAV uses a single protocol but providers differ on
which they require — not obvious from provider docs):
- **basic:** `url`, `auth_method: "basic"`, `user`, `pass`
- **oauth:** `url`, `auth_method: "oauth"`, `token_url`, `client_id`, `client_secret`, `refresh_token`

### Managing credentials

```bash
node $SHROK_SKILLS_DIR/calendar/creds.mjs list                  # passwords/secrets masked; url/user shown
node $SHROK_SKILLS_DIR/calendar/creds.mjs set <alias> --url U --user U --pass P              # basic
node $SHROK_SKILLS_DIR/calendar/creds.mjs set <alias> --url U --auth-method oauth --token-url U --client-id ID --client-secret S --refresh-token T
node $SHROK_SKILLS_DIR/calendar/creds.mjs set <alias> --stdin   # full JSON entry on stdin
node $SHROK_SKILLS_DIR/calendar/creds.mjs set-default <alias>
node $SHROK_SKILLS_DIR/calendar/creds.mjs remove <alias>
```

**Escape hatch:** the old env vars (`CALDAV_URL`, `CALDAV_USER`, `CALDAV_PASS`, `CALDAV_AUTH_METHOD`,
`CALDAV_TOKEN_URL`, `CALDAV_CLIENT_ID`, `CALDAV_CLIENT_SECRET`, `CALDAV_REFRESH_TOKEN`) still work as
per-field fallbacks if set.
