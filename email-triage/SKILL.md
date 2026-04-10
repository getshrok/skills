---
name: email-triage
description: Checks the inbox and handles each new email.
---

## Steps to execute

1. Fetch messages since `lastChecked` using the configured `EMAIL_SKILL` (its own `SKILL.md` has the exact command).
2. For each new message:
   - If it matches the urgent criteria, reply saying so.
   - Pick the best handler from the configured rules. If nothing fits, use `email-triage/digest`.
   - Spawn a sub-agent. Prompt is explanation saying an email came in + metadata + body. Fire-and-forget; you don't need the result.
3. Update `lastChecked` to the run start time.

Urgent and handler are additive, not exclusive — an urgent email still gets spawned to its handler so it lands in the digest or ledger like any other.

## Built-in handler

- `email-triage/digest` — catch-all.

