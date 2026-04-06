---
name: image-generate-openai
description: Generate and edit images using OpenAI's GPT Image models. Use when the user asks to create, draw, design, or edit an image and has OpenAI configured as their provider.
skill-deps:
  - code-execution
---

**Package:** openai. Get `OPENAI_API_KEY` from env or MEMORY.md.

Save images to `$WORKSPACE_PATH/media/`.

## Models

| Model | Notes |
|-------|-------|
| `gpt-image-1` | Default. Good general quality. |
| `gpt-image-1.5` | Best quality, complex scenes. |
| `gpt-image-1-mini` | Fast, cheap. |

## Options

**Sizes:** `1024x1024`, `1536x1024`, `1024x1536`, `auto`

**Quality:** `low`, `medium`, `high`, `auto`

**Output formats:** `png` (default), `webp`, `jpeg`. Use `png` or `webp` for transparency support.
