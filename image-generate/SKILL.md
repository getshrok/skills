---
name: image-generate
description: Generate and edit images using Google's Gemini image models (Nano Banana). Use when the user asks to create, draw, design, or edit an image.
skill-deps:
  - code-execution
---

Uses Google's Gemini image generation (Nano Banana) via the `@google/genai` SDK. Requires a Gemini API key — the same one used for Gemini as an LLM provider. Check `MEMORY.md` or the environment for `GEMINI_API_KEY`.

```bash
TMPDIR=$(mktemp -d)
cd "$TMPDIR" && npm init -y --quiet && npm install --quiet @google/genai
node script.mjs
cp *.png "$WORKSPACE_PATH/media/"
rm -rf "$TMPDIR"
```

Save generated images to `$WORKSPACE_PATH/media/` so the user can see them in the dashboard.

## Generate an image

```js
import { GoogleGenAI } from '@google/genai'
import fs from 'fs'

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY })

const response = await ai.models.generateContent({
  model: 'gemini-2.5-flash-image',
  contents: 'A cozy cabin in the mountains at sunset, digital art style',
  config: {
    responseModalities: ['TEXT', 'IMAGE'],
  },
})

for (const part of response.candidates[0].content.parts) {
  if (part.inlineData) {
    fs.writeFileSync('output.png', Buffer.from(part.inlineData.data, 'base64'))
    console.log('Image saved: output.png')
  }
  if (part.text) console.log(part.text)
}
```

## Edit an existing image

Pass the source image alongside the edit instruction:

```js
const imageBuffer = fs.readFileSync('input.png')

const response = await ai.models.generateContent({
  model: 'gemini-2.5-flash-image',
  contents: [
    { text: 'Remove the background and replace it with a gradient from blue to purple' },
    { inlineData: { mimeType: 'image/png', data: imageBuffer.toString('base64') } },
  ],
  config: {
    responseModalities: ['TEXT', 'IMAGE'],
  },
})
```

## Options

**Aspect ratio and resolution** via `imageConfig`:

```js
config: {
  responseModalities: ['TEXT', 'IMAGE'],
  imageConfig: {
    aspectRatio: '16:9',  // 1:1, 4:3, 3:4, 16:9, 9:16
  },
}
```

## Models

| Model | Best for | Cost |
|-------|----------|------|
| `gemini-2.5-flash-image` | General use, fast, cheap (~$0.04/image) | Default choice |
| `gemini-3-pro-image-preview` | High fidelity, text in images, 4K, complex compositions | When quality matters |
| `gemini-3.1-flash-image-preview` | Balance of Pro quality and Flash speed | Newer alternative |

Start with `gemini-2.5-flash-image` unless the user specifically needs higher quality.

## Tips

- **Be specific in prompts.** "A watercolor painting of a golden retriever sitting in a meadow at golden hour" beats "a dog."
- **Style keywords help.** Append style cues: "digital art", "photorealistic", "watercolor", "minimalist", "isometric", "pixel art."
- **For text in images**, use the Pro model — Flash struggles with text rendering.
- **For edits**, describe what to change clearly. "Make the sky more dramatic" works. "Fix it" doesn't.
