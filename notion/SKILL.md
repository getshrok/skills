---
name: notion
description: Read, create, update, and query Notion pages and databases. Use when the user wants to work with their Notion workspace — tasks, notes, databases, content.
---

All operations use `curl` against `https://api.notion.com`.

## Authentication

Token lives at `~/.config/notion/api_key` (first line of file).

Every request needs these headers:

```
Authorization: Bearer $NOTION_KEY
Notion-Version: 2022-06-28
Content-Type: application/json
```

## Critical gotcha

The integration can ONLY see pages and databases the user has explicitly shared with it (page menu → Connections → add the integration). If queries return empty, this is almost always why. Remind the user to share relevant pages before giving up.
