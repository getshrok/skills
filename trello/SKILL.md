---
name: trello
description: Manage Trello boards, lists, cards, labels, and checklists. Use when the user needs to organize tasks, track projects, or work with their Trello boards.
---

## Scripts

- `trello.mjs` — All Trello operations. CLI for all Trello operations. Run via bash: `node trello.mjs <command> [options]`.

## Credentials & accounts

Secrets are **stored in `.trello-credentials.json`** (chmod 600), keyed by a short account alias.
**You never type secrets for normal use** — select an account with `--account <alias>` (or `-a`);
the script loads the key/token itself. The committed `.trello-credentials.json` shows the
**example shape** — use it, don't invent your own.

```bash
node $SHROK_SKILLS_DIR/trello/trello.mjs boards --account myalias
```

### First-time setup

1. User creates a Power-Up at https://trello.com/power-ups/admin → API Key tab → generate key
2. On the same page, click the Token link to authorize (scope: read,write, expiration: never)
3. Store both: `trello.mjs creds set <alias> --api-key <KEY> --token <TOKEN>`

### Managing credentials

```bash
node $SHROK_SKILLS_DIR/trello/trello.mjs creds list                  # masked fingerprints, no secrets
node $SHROK_SKILLS_DIR/trello/trello.mjs creds set <alias> --api-key KEY --token T [--label L] [--default]
node $SHROK_SKILLS_DIR/trello/trello.mjs creds set <alias> --stdin   # JSON {label,api_key,token} on stdin
node $SHROK_SKILLS_DIR/trello/trello.mjs creds set-default <alias>
node $SHROK_SKILLS_DIR/trello/trello.mjs creds remove <alias>
```

**Escape hatch:** if `TRELLO_API_KEY` + `TRELLO_TOKEN` env vars are both set, they override the store.
