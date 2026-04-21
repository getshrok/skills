---
name: claude-code
description: Delegate tasks to Claude Code — use for heavy coding tasks or projects.
---

## Setup check

Before first use, confirm Claude Code is installed and authenticated:

```bash
which claude && claude auth status
```

If `which claude` is empty, tell the user to install it (https://docs.claude.com/en/docs/claude-code/quickstart) and stop. If `auth status` returns `loggedIn: false`, tell the user to run `claude auth login` themselves — don't try to log in on their behalf.

## Running Claude Code headlessly

The agent-invoked shape is always: **`cd` into the project (or general working directory), then `claude -p`**. `-p` is non-interactive (without it the CLI tries to open a TUI and hangs your bash call).

```bash
cd /path/to/project
claude -p "Refactor auth.ts to use JWT refresh rotation" \
  --permission-mode bypassPermissions \
  --max-budget-usd 2.50 \
  --output-format json \
  < /dev/null
```

Always redirect stdin from `/dev/null`. Without it, Claude Code waits 3s for piped input on every call — wasted time, and it emits a noisy warning.

Three flags that matter for every invocation:

- **`--permission-mode`** — required when Claude Code will call tools (Bash, Edit, etc.). Options:
  - `acceptEdits` — file edits auto-accepted, other tools prompt (safe default for write tasks)
  - `bypassPermissions` — all tools auto-accepted (use when you trust the task)
  - `plan` — read-only, writes a plan but doesn't execute (use for review/design tasks)
  - Default mode will hang on the first tool call waiting for a prompt response that never comes.
- **`--output-format json`** — returns a single JSON object with `result` (the response text), `session_id`, `total_cost_usd`, `is_error`, `stop_reason`, `permission_denials`. Parse it; don't try to scrape prose.

## Sessions — persistence across invocations

Claude Code has built-in session management. Use it when the task spans multiple calls.

Starting a named session (pick a UUID — the agent can generate one with `uuidgen` or `python -c "import uuid;print(uuid.uuid4())"`):

```bash
claude -p "First message" --session-id <uuid> --permission-mode acceptEdits --output-format json < /dev/null
```

Resuming later:

```bash
claude -p "Follow-up message" --resume <uuid> --permission-mode acceptEdits --output-format json < /dev/null
```

Or just continue the most recent session in this cwd:

```bash
claude -p "Follow-up" -c --permission-mode acceptEdits --output-format json < /dev/null
```

## Gotchas

- **Claude Code sessions can run minutes.** A real refactor might take 3–8 minutes. Don't set tight bash timeouts; allow 10+ minutes for substantial work.
- **Permission denials appear in the JSON.** Check `permission_denials` in the result — if non-empty, Claude Code wanted to do something your `--permission-mode` didn't allow. Rerun with a more permissive mode if the denial was legitimate.