---
name: email-triage/digest
description: Catch-all destination for routed emails.
---

Two modes, chosen by how this skill is spawned.

## Log mode (if spawned with an email payload)

Append one JSON line to `pending.jsonl` in this skill's directory:

```json
{"date": "2026-04-10T12:34:00Z", "from": "sender@example.com", "subject": "...", "summary": "..."}
```

- `summary` is a single sentence about what the email is actually about — not the subject reworded, not the first line verbatim. If it's a newsletter, say which stories matter. If it's a notification, say what happened and what (if anything) needs action.
- Create `pending.jsonl` if it doesn't exist. Never rewrite existing lines.

## Publish mode (if spawned with instructions to present the digest or no instructions at all)

1. Read all of `pending.jsonl`. If it's missing or empty, say the inbox was quiet and stop — no empty digest.
2. Group entries in whatever reads best for the set — by theme, by sender, or by day. No fixed structure.
3. For each entry: sender, subject, date, one-line summary.
4. End with a short "worth a closer look" list if anything stands out. If nothing does, skip it.
5. Deliver the digest in your reply.
6. Delete `pending.jsonl` so the next cycle starts empty.

Keep it scannable. Under a minute to read, if possible.
