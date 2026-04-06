---
name: news-monitor
description: Monitor news topics and alert the user when something matching their criteria happens. Runs on a schedule, checks Google News via web_search, and only surfaces what matters.
---

## How it works

Each watch is a sub-skill directory under this skill. The parent runs on a schedule and spawns a sub-agent for each watch. Each sub-agent searches, applies its criteria, and reports back only if there's something new.

## Adding a watch

When the user asks to watch for something, create a new sub-skill directory:

```
news-monitor/
  <watch-name>/
    SKILL.md    ← query, criteria, instructions
    MEMORY.md   ← relayed topics
```

The sub-skill SKILL.md should follow this template:

```markdown
---
name: news-monitor/<watch-name>
description: <one-line description of what this watch is for>
---

Search query: <what to search Google News for>

Criteria: <natural language description of what the user actually wants to know — be specific about what to include AND exclude>

One-time: <yes or no — if yes, this watch auto-deletes after the first match>

## Instructions

1. Run `web_search` with the search query
2. Scan results — does any headline or snippet match the criteria?
3. Read MEMORY.md for topics already relayed to the user
4. If a result matches the criteria AND hasn't already been relayed (same underlying topic, even from a different source), report it
5. If you report something, append a one-line summary with today's date to MEMORY.md
6. If nothing new matches, report nothing
7. Keep the relayed list trimmed to the last 20 entries
8. If this is a one-time watch and you reported a match, delete this sub-skill directory — the watch is fulfilled
```

The sub-skill MEMORY.md starts empty or with a header:

```markdown
## Relayed
```

## Removing a watch

Delete the sub-skill directory.

## Schedule

Recommended: every 4-6 hours via the scheduler. News isn't real-time urgent and most topics don't change hourly.
