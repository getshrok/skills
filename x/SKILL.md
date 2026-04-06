---
name: x
description: Post tweets, threads, and replies on X (formerly Twitter). Read tweets and timelines if on Basic tier or higher.
npm-deps:
  - twitter-api-v2
---

## Scripts

- `x.mjs` — All X operations. Run `x.mjs --help` for commands.

## First-time setup

1. User goes to https://developer.x.com → create a Project and App
2. Set app permissions to **Read and Write**
3. Go to Keys and Tokens tab → generate all four credentials
4. Write to MEMORY.md

**Important**: If permissions are changed after generating tokens, the Access Token and Secret must be regenerated or they silently keep the old permissions.

## MEMORY.md format

```
X_API_KEY=...
X_API_SECRET=...
X_ACCESS_TOKEN=...
X_ACCESS_SECRET=...
```

## Tier limits

- **Free ($0)**: 500 posts/month, write-only (no search, timelines, or reading other users). Only `post`, `delete`, `me` commands work.
- **Basic ($200/mo)**: 50K posts/month, 15K reads/month. All commands work.
- **Pro ($5K/mo)**: Full access including full-archive search.
