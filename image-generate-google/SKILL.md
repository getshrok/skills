---
name: image-generate-google
description: Generate and edit images using Google's Gemini image models (Nano Banana). Use when the user asks to create, draw, design, or edit an image.
skill-deps:
  - code-execution
---

**Package:** @google/genai. Get `GEMINI_API_KEY` from MEMORY.md. If the user provides a key, save it to MEMORY.md immediately.

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
