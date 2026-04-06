---
name: image-generate-openai
description: Generate and edit images using OpenAI's GPT Image models. Use when the user asks to create, draw, design, or edit an image and has OpenAI configured as their provider.
skill-deps:
  - code-execution
---

Uses OpenAI's GPT Image models via the `openai` npm package (already installed). Requires `OPENAI_API_KEY` in the environment.

```bash
TMPDIR=$(mktemp -d)
cd "$TMPDIR" && npm init -y --quiet && npm install --quiet openai
node script.mjs
cp *.png "$WORKSPACE_PATH/media/"
rm -rf "$TMPDIR"
```

Save generated images to `$WORKSPACE_PATH/media/` so the user can see them in the dashboard.

## Generate an image

```js
import OpenAI from 'openai'
import { writeFile } from 'fs/promises'

const client = new OpenAI()

const response = await client.images.generate({
  model: 'gpt-image-1',
  prompt: 'A cozy cabin in the mountains at sunset, digital art style',
  n: 1,
  size: '1024x1024',
})

const buffer = Buffer.from(response.data[0].b64_json, 'base64')
await writeFile('output.png', buffer)
console.log('Image saved: output.png')
```

## Edit an existing image

Pass a source image with edit instructions. Optionally include a mask (transparent areas indicate where to edit):

```js
import OpenAI, { toFile } from 'openai'
import fs from 'fs'
import { writeFile } from 'fs/promises'

const client = new OpenAI()

const response = await client.images.edit({
  model: 'gpt-image-1',
  image: await toFile(fs.createReadStream('input.png'), 'input.png'),
  prompt: 'Add a hot air balloon in the sky',
  n: 1,
  size: '1024x1024',
})

const buffer = Buffer.from(response.data[0].b64_json, 'base64')
await writeFile('edited.png', buffer)
```

Accepts up to 10 input images. Images should be PNG, under 25MB.

## Transparent backgrounds

```js
const response = await client.images.generate({
  model: 'gpt-image-1',
  prompt: 'A red rose with no background',
  background: 'transparent',
  output_format: 'png',  // transparency requires png or webp
})
```

## Options

**Sizes:** `1024x1024` (square), `1536x1024` (landscape), `1024x1536` (portrait), `auto` (model picks).

**Quality:** `low`, `medium`, `high`, `auto`. Higher quality costs more.

**Output format:** `png` (default), `webp`, `jpeg`. Use `png` or `webp` for transparency.

## Models

| Model | Best for | Notes |
|-------|----------|-------|
| `gpt-image-1` | General use, good quality | Default choice |
| `gpt-image-1.5` | Best quality, complex scenes | State of the art |
| `gpt-image-1-mini` | Fast, cheap, simpler images | When cost matters |

Start with `gpt-image-1` unless the user needs top quality or cost savings.

## Tips

- **Be specific in prompts.** Detail the subject, style, lighting, composition.
- **Style keywords help.** "photorealistic", "watercolor", "3D render", "flat illustration", "pixel art."
- **Text rendering** works well with GPT Image models — include exact text in quotes in the prompt.
- **For edits with masks**, transparent areas in the mask indicate where changes should be applied.
