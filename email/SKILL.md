---
name: email
description: Read, search, and send email via IMAP/SMTP.
---

## Scripts

All scripts are in `$SHROK_SKILLS_DIR/email/` and output JSON to stdout. Run any script with `--help` for usage.

All date flags accept ISO 8601, relative (`today`, `yesterday`), natural (`next monday`), and offset (`in 3 days`, `7 days ago`). Naked ISO timestamps (no offset) are interpreted in the system's local timezone. All `date` fields in script output are ISO 8601 with the local timezone offset (e.g. `2026-05-21T10:30:00-04:00`) — never raw UTC.

npm-deps: imapflow, nodemailer

## Auth

Reading and sending use separate connections — both must be configured independently.

**IMAP (reading):** `IMAP_HOST`, `IMAP_PORT` (default 993), `IMAP_USER`, `IMAP_PASS`
**SMTP (sending):** `SMTP_HOST`, `SMTP_PORT` (default 587), `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`

Save all credentials to MEMORY.md when configured.
