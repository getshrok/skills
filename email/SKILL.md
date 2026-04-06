---
name: email
version: 1.1.0
author: getshrok
description: Read, search, and send email via IMAP/SMTP.
npm-deps:
  - imapflow
  - nodemailer
---

## Scripts

All scripts are in `$SATURDAY_SKILLS_DIR/email/` and output JSON to stdout.

- `read.mjs` — fetch messages from a folder (filters: sender, subject, date, unread)
- `search.mjs` — IMAP SEARCH across folders for free-text queries
- `message.mjs` — fetch full message body, headers, and attachments
- `send.mjs` — send or reply via SMTP

Run with `--help` for flags. Exit codes: 0 success, 1 usage, 2 auth, 3 connection, 4 not found.

All date flags accept ISO 8601, relative (`today`, `yesterday`), natural (`next monday`), and offset (`in 3 days`, `7 days ago`).

## Auth

Pass credentials as env vars. Credentials are stored in this skill's `MEMORY.md`.

**IMAP (reading):** `IMAP_HOST`, `IMAP_PORT` (default 993), `IMAP_USER`, `IMAP_PASS`
**SMTP (sending):** `SMTP_HOST`, `SMTP_PORT` (default 587), `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`

## Setup

If credentials are missing, walk the user through connecting their email provider:

- **Gmail:** Enable App Passwords at myaccount.google.com/apppasswords (requires 2FA). IMAP host: `imap.gmail.com`, SMTP host: `smtp.gmail.com`.
- **Outlook/Hotmail:** App password from account.microsoft.com. IMAP: `outlook.office365.com`, SMTP: `smtp-mail.outlook.com:587`.
- **Other IMAP/SMTP:** Ask the user for their host, port, username, and password.

Save all credentials to MEMORY.md when done.
