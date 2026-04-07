---
name: image-generate-openai
description: Generate and edit images using OpenAI's GPT Image models. Use when the user asks to create, draw, design, or edit an image and has OpenAI configured as their provider.
---

## Scripts

- `generate.mjs` — CLI for image generation and editing. Run via bash: `node generate.mjs <command> [options]`

Pass the API key via `--key` or `OPENAI_API_KEY` env var. Get the key from MEMORY.md if configured.

Save output to `$WORKSPACE_PATH/media/`.

**Important:** Image generation takes 30-60+ seconds. Set bash timeout to at least 120000ms: `{"command": "...", "timeout": 120000}`

## Models

| Model | Notes |
|-------|-------|
| `gpt-image-1` | Default. Good general quality. |
| `gpt-image-1.5` | Best quality, complex scenes. |
| `gpt-image-1-mini` | Fast, cheap. |

## Options

**Sizes:** `1024x1024` (default), `1536x1024`, `1024x1536`, `auto`

**Quality:** `low`, `medium`, `high`, `auto` (default)
