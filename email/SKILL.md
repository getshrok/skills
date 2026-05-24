---
name: email
description: Read, search, and send email via IMAP/SMTP.
---

## Scripts

All scripts are in `$SHROK_SKILLS_DIR/email/` and output JSON to stdout. Run any script with `--help` for usage.

All date flags accept ISO 8601, relative (`today`, `yesterday`), natural (`next monday`), and offset (`in 3 days`, `7 days ago`). Naked ISO timestamps (no offset) are interpreted in the system's local timezone. All `date` fields in script output are ISO 8601 with the local timezone offset (e.g. `2026-05-21T10:30:00-04:00`) — never raw UTC.

npm-deps: imapflow, nodemailer

## Auth & accounts

Credentials are **stored in `.email-credentials.json`** (chmod 600), keyed by a short account
alias. **You never type secrets for normal use** — select an account with `--account <alias>`
(or `-a`); the scripts load host/user/password themselves. The committed
`.email-credentials.json` shows the **example shape** — use it, don't invent your own.

```bash
node $SHROK_SKILLS_DIR/email/read.mjs --account work
node $SHROK_SKILLS_DIR/email/send.mjs --account work --to a@b.com --subject Hi --body "..."
```

Reading (IMAP) and sending (SMTP) use separate connections — each account entry holds both:
`imap_host`, `imap_port` (default 993), `imap_user`, `imap_pass`; `smtp_host`, `smtp_port`
(default 587), `smtp_user`, `smtp_pass`, `smtp_from`.

### Managing credentials

```bash
node $SHROK_SKILLS_DIR/email/creds.mjs list                  # passwords masked; hosts/users shown
node $SHROK_SKILLS_DIR/email/creds.mjs set <alias> --imap-host H --imap-user U --imap-pass P \
     --smtp-host H --smtp-user U --smtp-pass P --smtp-from ADDR
node $SHROK_SKILLS_DIR/email/creds.mjs set <alias> --stdin   # full JSON entry on stdin
node $SHROK_SKILLS_DIR/email/creds.mjs set-default <alias>
node $SHROK_SKILLS_DIR/email/creds.mjs remove <alias>
```

**Escape hatch:** the old env vars (`IMAP_HOST`/`IMAP_USER`/`IMAP_PASS`, `SMTP_HOST`/`SMTP_USER`/
`SMTP_PASS`/`SMTP_FROM`, etc.) still work as per-field fallbacks if set.
