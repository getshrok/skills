---
name: create-image
description: Generate and edit images using OpenAI (GPT Image) or Google (Gemini / Nano Banana). Use when the user asks to create, draw, design, or edit an image.
skill-deps:
  - code-execution
---

Two providers are supported. Pick whichever key the user has in MEMORY.md (`OPENAI_API_KEY` or `GEMINI_API_KEY`). If both are present, default to OpenAI unless the user has expressed a preference. **If one provider fails, fall back to the other before reporting an error.** If the user supplies a new key, save it to MEMORY.md immediately.

Save images to `$WORKSPACE_PATH/media/`.

## OpenAI (GPT Image)

Run via the bundled CLI: `node openai.mjs <command> [options]`. Pass the API key via `--key` or `OPENAI_API_KEY` env var.

**Important:** `gpt-image-1.5` typically takes ~5–10s; legacy `gpt-image-1` takes 30–60+s. Set bash timeout to at least 120000ms when using the legacy model: `{"command": "...", "timeout": 120000}`

| Model | Notes |
|-------|-------|
| `gpt-image-1.5` | Default. Best quality, ~4× faster than `gpt-image-1`. |
| `gpt-image-1-mini` | Fast, cheap. |
| `gpt-image-1` | Legacy. Slower; prefer 1.5 unless the user asks for it. |

**Sizes:** `1024x1024` (default), `1536x1024`, `1024x1536`, `auto`

**Quality:** `low`, `medium`, `high`, `auto` (default)

## Google (Gemini / Nano Banana)

Use the `@google/genai` package directly via code-execution.

| Model | Notes |
|-------|-------|
| `gemini-2.5-flash-image` | Default. Fast, cheap. |
| `gemini-3-pro-image-preview` | Highest quality, best at text in images. |
| `gemini-3.1-flash-image-preview` | Balanced quality/speed. |

Use the Pro model when the image contains text — Flash struggles with text rendering.

**Aspect ratios** (set via `config.imageConfig.aspectRatio` in the `@google/genai` call): `1:1`, `2:3`, `3:2`, `3:4`, `4:3`, `4:5`, `5:4`, `9:16`, `16:9`, `21:9`. `gemini-3.1-flash-image-preview` additionally supports the extremes `1:4`, `4:1`, `1:8`, `8:1`.
