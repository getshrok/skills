---
name: image-generate
description: Generate and edit images using Google's Gemini image models (Nano Banana). Use when the user asks to create, draw, design, or edit an image.
---

Uses `@google/genai` SDK. Get `GEMINI_API_KEY` from env or MEMORY.md.

Install in a temp dir, generate, then copy output:

```bash
TMPDIR=$(mktemp -d)
cd "$TMPDIR" && npm init -y --quiet && npm install --quiet @google/genai
node script.mjs
cp *.png "$WORKSPACE_PATH/media/"
rm -rf "$TMPDIR"
```

Save images to `$WORKSPACE_PATH/media/`.

## Models

| Model | Notes |
|-------|-------|
| `gemini-2.5-flash-image` | Default. Fast, cheap. |
| `gemini-3-pro-image-preview` | Highest quality, best at text in images. |
| `gemini-3.1-flash-image-preview` | Balanced quality/speed. |

Use Pro model when the image contains text — Flash struggles with text rendering.

## Options

**Aspect ratios** (via `imageConfig.aspectRatio`): `1:1`, `4:3`, `3:4`, `16:9`, `9:16`
