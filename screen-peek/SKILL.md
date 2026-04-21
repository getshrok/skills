---
name: screen-peek
description: Capture a screenshot of the user's screen. Use when the user says "look at my screen", "what's on my screen", "screenshot", or asks about something visible on their display.
npm-deps: screenshot-desktop
---

## Usage

```js
const screenshot = require('screenshot-desktop')
const path = require('path')

const filePath = path.join(process.env.WORKSPACE_PATH, 'media', `screenshot-${Date.now()}.png`)
await screenshot({ filename: filePath, format: 'png' })
```

After capturing, use `view_image` to see the screenshot and describe what's on screen.

## Linux prerequisite

`screenshot-desktop` relies on ImageMagick on Linux. If capture fails with a "command not found" or similar error, install it:

```bash
sudo apt install -y imagemagick
```
