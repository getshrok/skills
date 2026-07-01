---
name: x
description: Post tweets, threads, and replies on X (formerly Twitter). Read tweets and timelines if on Basic tier or higher.
npm-deps: [twitter-api-v2]
---

## Scripts

- `x.mjs` -- All X operations. CLI for all X operations. Run via bash: `node x.mjs <command> [options]`.

## Credentials & accounts

Secrets are **stored in `.x-credentials.json`** (chmod 600), keyed by a short account alias.
**You never type secrets for normal use** — select an account with `--account <alias>` (or `-a`).
The committed `.x-credentials.json` shows the **example shape** — use it, don't invent your own.

```bash
node $SHROK_SKILLS_DIR/x/x.mjs post --account myalias --text "hello"
```

### Managing credentials

```bash
node $SHROK_SKILLS_DIR/x/x.mjs creds list                  # masked fingerprints, no secrets
node $SHROK_SKILLS_DIR/x/x.mjs creds set <alias> --api-key K --api-secret S --access-token T --access-secret S
node $SHROK_SKILLS_DIR/x/x.mjs creds set <alias> --stdin   # JSON {label,api_key,api_secret,access_token,access_secret} on stdin
node $SHROK_SKILLS_DIR/x/x.mjs creds set-default <alias>
node $SHROK_SKILLS_DIR/x/x.mjs creds remove <alias>
```

**Escape hatch:** if `X_API_KEY` + `X_API_SECRET` + `X_ACCESS_TOKEN` + `X_ACCESS_SECRET` env vars
are all set, they override the store.

**Gotcha**: If app permissions are changed after generating tokens, the Access Token and Secret must be regenerated or they silently keep the old permissions.

## Tier limits

- **Free ($0)**: 500 posts/month, write-only. Only `post`, `delete`, `me` commands work.
- **Basic ($200/mo)**: 50K posts/month, 15K reads/month. All commands work.
- **Pro ($5K/mo)**: Full access including full-archive search.
