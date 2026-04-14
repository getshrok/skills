---
name: email
description: Read, search, and send email via IMAP/SMTP.
---

## Scripts

All scripts are in `$SHROK_SKILLS_DIR/email/` and output JSON to stdout. Run any script with `--help` for usage.

All date flags accept ISO 8601, relative (`today`, `yesterday`), natural (`next monday`), and offset (`in 3 days`, `7 days ago`).

npm-deps: imapflow, nodemailer

## Auth

Reading and sending use separate connections — both must be configured independently.

**IMAP (reading):** `IMAP_HOST`, `IMAP_PORT` (default 993), `IMAP_USER`, `IMAP_PASS`
**SMTP (sending):** `SMTP_HOST`, `SMTP_PORT` (default 587), `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`

Save all credentials to MEMORY.md when configured.
