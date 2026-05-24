---
name: gmail
description: "Read, search, send, and organize Gmail messages."
---

## Scripts

- `gmail.mjs` — All Gmail operations. CLI for all Gmail operations. Run via bash: `node gmail.mjs <command> [options]`.

## Credentials & accounts

Secrets are **stored in `.gmail-credentials.json`** (chmod 600), keyed by a short account alias.
**You never type secrets for normal use.** Pick an account with `--account <alias>` (or `-a`):

```bash
node gmail.mjs list --account ashley --since "$(date -Iseconds)"
node gmail.mjs profile -a zoey
```

Known accounts are listed in `MEMORY.md`. If `--account` is omitted and there is no default and
more than one account exists, the script errors and lists the available aliases. (There is no
default set by design, so include `--account` on every call.)

Why aliases instead of pasting tokens: refresh tokens are long opaque strings that are easy to
mis-copy. The alias keeps the secret entirely inside the script — you only ever handle a short name.

### Managing credentials

Use these only when explicitly storing/changing/deleting credentials — not for normal mail ops:

```bash
node gmail.mjs creds list                       # accounts + emails + masked fingerprints (no secrets)
node gmail.mjs creds set <alias> --email E --client-id ID --client-secret S --refresh-token T
node gmail.mjs creds set <alias> --stdin        # read a JSON {email,client_id,client_secret,refresh_token} from stdin
node gmail.mjs creds set-default <alias>
node gmail.mjs creds remove <alias>
```

`creds set` updates only the fields you pass. After setting, verify with `creds list` — it shows a
short fingerprint (last 4 chars + length) of each value so you can sanity-check without exposing it.

To obtain a fresh refresh token via OAuth without ever copying it:

```bash
node gmail.mjs auth-url --account <alias>            # client_id taken from the stored account
# (user authorizes, returns a code)
node gmail.mjs auth-exchange <code> --account <alias>  # writes the refresh token into the store directly
```

**Escape hatch:** if `GMAIL_CLIENT_ID` + `GMAIL_CLIENT_SECRET` + `GMAIL_REFRESH_TOKEN` are all set
as env vars, they override the store (useful for a one-off test). Normal use should rely on the store.

## Token Cache

Access tokens are cached in `.token-cache` (JSON, gitignored) and keyed by `client_id`, so multiple accounts cache independently without collision. Tokens are reused until 60 seconds before expiry, then refreshed automatically. You do not need to manage this manually.

## Timestamps (`--since`, stored cutoffs, etc.)

Use local time with an explicit offset, e.g. `2026-05-20T08:15:42-04:00` — the output of `date -Iseconds` on this system. The skill parses the offset and converts internally; you get human-readable local time in stored files, and the Gmail query stays correct.

Always work in local time — never UTC. Do **not** write `...Z` while filling in local-clock numbers; that silently shifts the cutoff by your UTC offset (4–5 hours for US Eastern) and causes already-seen messages to reappear on the next run.
