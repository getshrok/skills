---
name: x
description: Post tweets, threads, and replies on X (formerly Twitter). Read tweets and timelines if on Basic tier or higher.
---

## Scripts

- `x.mjs` -- All X operations. CLI for all X operations. Run via bash: `node x.mjs <command> [options]`.

npm-deps: twitter-api-v2

## Credentials (MEMORY.md)

```
X_API_KEY=...
X_API_SECRET=...
X_ACCESS_TOKEN=...
X_ACCESS_SECRET=...
```

**Gotcha**: If app permissions are changed after generating tokens, the Access Token and Secret must be regenerated or they silently keep the old permissions.

## Tier limits

- **Free ($0)**: 500 posts/month, write-only. Only `post`, `delete`, `me` commands work.
- **Basic ($200/mo)**: 50K posts/month, 15K reads/month. All commands work.
- **Pro ($5K/mo)**: Full access including full-archive search.
