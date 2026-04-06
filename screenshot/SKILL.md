---
name: screenshot
description: Capture a screenshot of the user's screen. Use when the user says "look at my screen", "what's on my screen", "screenshot", or asks about something visible on their display.
skill-deps:
  - code-execution
---

**Package:** screenshot-desktop. Save output to `$WORKSPACE_PATH/media/`.

**Linux caveat:** Requires ImageMagick — if capture fails, run `sudo apt install imagemagick`.

**Limitation:** Agents cannot view images mid-session. After capturing, tell the user the screenshot was saved and offer to help based on their description of what's on screen.
