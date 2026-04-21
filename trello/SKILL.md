---
name: trello
description: Manage Trello boards, lists, cards, labels, and checklists. Use when the user needs to organize tasks, track projects, or work with their Trello boards.
---

## Scripts

- `trello.mjs` — All Trello operations. CLI for all Trello operations. Run via bash: `node trello.mjs <command> [options]`.

## First-time setup

1. User creates a Power-Up at https://trello.com/power-ups/admin → API Key tab → generate key
2. On the same page, click the Token link to authorize (scope: read,write, expiration: never)
3. Write both to MEMORY.md as `TRELLO_API_KEY` and `TRELLO_TOKEN`

## MEMORY.md format

```
TRELLO_API_KEY=...
TRELLO_TOKEN=...
```
