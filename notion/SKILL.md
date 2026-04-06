---
name: notion
description: Read, create, update, and query Notion pages and databases. Use when the user wants to work with their Notion workspace — tasks, notes, databases, content.
---

All operations use `curl` against `https://api.notion.com`. No npm packages needed.

## Authentication

The integration token lives at `~/.config/notion/api_key` (first line of file). Read it once per session:

```bash
NOTION_KEY=$(head -1 ~/.config/notion/api_key)
```

If the file doesn't exist, walk the user through setup:
1. Go to [notion.so/profile/integrations](https://www.notion.so/profile/integrations) → New integration
2. Name it, select the workspace, grant: read content, update content, insert content
3. Copy the token (starts with `ntn_` or `secret_`)
4. Save: `mkdir -p ~/.config/notion && echo "<token>" > ~/.config/notion/api_key`
5. **Important**: In Notion, the user must share each page/database with the integration (click ··· → Connections → add it). The integration only sees what's explicitly shared.

Every request needs these headers:

```bash
-H "Authorization: Bearer $NOTION_KEY" \
-H "Notion-Version: 2022-06-28" \
-H "Content-Type: application/json"
```

## Core operations

**Search the workspace:**
```bash
curl -s -X POST "https://api.notion.com/v1/search" \
  -H "Authorization: Bearer $NOTION_KEY" -H "Notion-Version: 2022-06-28" -H "Content-Type: application/json" \
  -d '{"query": "Meeting Notes", "page_size": 5}'
```

**Query a database** (with optional filter/sort):
```bash
curl -s -X POST "https://api.notion.com/v1/databases/<database-id>/query" \
  -H "Authorization: Bearer $NOTION_KEY" -H "Notion-Version: 2022-06-28" -H "Content-Type: application/json" \
  -d '{"filter": {"property": "Status", "select": {"equals": "In Progress"}}, "page_size": 10}'
```

**Read a page's properties:**
```bash
curl -s "https://api.notion.com/v1/pages/<page-id>" \
  -H "Authorization: Bearer $NOTION_KEY" -H "Notion-Version: 2022-06-28"
```

**Read a page's content (blocks):**
```bash
curl -s "https://api.notion.com/v1/blocks/<page-id>/children?page_size=100" \
  -H "Authorization: Bearer $NOTION_KEY" -H "Notion-Version: 2022-06-28"
```

**Create a page in a database:**
```bash
curl -s -X POST "https://api.notion.com/v1/pages" \
  -H "Authorization: Bearer $NOTION_KEY" -H "Notion-Version: 2022-06-28" -H "Content-Type: application/json" \
  -d '{
    "parent": {"database_id": "<database-id>"},
    "properties": {
      "Name": {"title": [{"text": {"content": "New task"}}]},
      "Status": {"select": {"name": "To Do"}},
      "Due": {"date": {"start": "2026-04-10"}}
    }
  }'
```

**Update a page's properties:**
```bash
curl -s -X PATCH "https://api.notion.com/v1/pages/<page-id>" \
  -H "Authorization: Bearer $NOTION_KEY" -H "Notion-Version: 2022-06-28" -H "Content-Type: application/json" \
  -d '{"properties": {"Status": {"select": {"name": "Done"}}}}'
```

**Append content to a page:**
```bash
curl -s -X PATCH "https://api.notion.com/v1/blocks/<page-id>/children" \
  -H "Authorization: Bearer $NOTION_KEY" -H "Notion-Version: 2022-06-28" -H "Content-Type: application/json" \
  -d '{"children": [{"paragraph": {"rich_text": [{"text": {"content": "New paragraph."}}]}}]}'
```

## Property type reference

When creating or updating pages, properties must match the database schema exactly (name and type). Common formats:

| Type | JSON format |
|------|------------|
| Title | `{"title": [{"text": {"content": "..."}}]}` |
| Rich text | `{"rich_text": [{"text": {"content": "..."}}]}` |
| Select | `{"select": {"name": "Option"}}` |
| Multi-select | `{"multi_select": [{"name": "Tag1"}, {"name": "Tag2"}]}` |
| Date | `{"date": {"start": "2026-04-10"}}` or with end: `{"start": "...", "end": "..."}` |
| Checkbox | `{"checkbox": true}` |
| Number | `{"number": 42}` |
| URL | `{"url": "https://..."}` |
| Email | `{"email": "user@example.com"}` |
| People | `{"people": [{"id": "<user-id>"}]}` |
| Relation | `{"relation": [{"id": "<page-id>"}]}` |

## Important details

- **Page IDs**: strip dashes if copying from a Notion URL. Both `abc123def456` and `abc123-def4-56` work.
- **Rate limit**: 3 requests/second average. Back off on 429 responses.
- **Pagination**: Results over 100 items return a `next_cursor`. Pass it as `{"start_cursor": "..."}` in the next request.
- **Sharing**: The integration only sees pages/databases the user has explicitly shared with it. If a query returns empty, this is usually why.
- **Read before write**: When updating a database entry, read the database schema first to get exact property names and types. Mismatched names silently fail.
