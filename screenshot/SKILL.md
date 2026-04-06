---
name: screenshot
description: Capture a screenshot of the user's screen. Use when the user says "look at my screen", "what's on my screen", "screenshot", or asks about something visible on their display.
skill-deps:
  - code-execution
---

Uses the `screenshot-desktop` npm package for cross-platform screen capture (macOS, Linux, Windows).

```bash
TMPDIR=$(mktemp -d)
cd "$TMPDIR" && npm init -y --quiet && npm install --quiet screenshot-desktop
node script.mjs
cp screenshot.png "$WORKSPACE_PATH/media/"
rm -rf "$TMPDIR"
```

## Capture the screen

```js
import screenshot from 'screenshot-desktop'
import fs from 'fs'

const img = await screenshot({ format: 'png' })
fs.writeFileSync('screenshot.png', img)
console.log('Screenshot saved: screenshot.png')
```

For multiple monitors, capture all displays:

```js
const displays = await screenshot.listDisplays()
for (const display of displays) {
  const img = await screenshot({ screen: display.id, format: 'png' })
  fs.writeFileSync(`screen-${display.id}.png`, img)
  console.log(`Saved: screen-${display.id}.png`)
}
```

## After capturing

The screenshot is saved to `$WORKSPACE_PATH/media/`. Tell the user the screenshot was captured and what you're doing with it.

**Current limitation:** Agents cannot directly view images mid-session. To analyze the screenshot, describe what the user asked about and offer to help based on their description of what's on screen. If the user is chatting through the dashboard, they can paste or reference the screenshot in a follow-up message for full visual analysis.

## Platform notes

`screenshot-desktop` handles platform differences automatically:
- **macOS**: uses `screencapture`
- **Linux**: uses `import` (ImageMagick) — may need `sudo apt install imagemagick` if not installed
- **Windows**: uses native .NET screen capture via PowerShell

If the capture fails on Linux, the error usually means ImageMagick isn't installed. Tell the user: `sudo apt install imagemagick`.
