---
name: screen-peek
description: Capture a screenshot of the user's screen. Use when the user says "look at my screen", "what's on my screen", "screenshot", or asks about something visible on their display.
skill-deps:
  - code-execution
---

**Package:** screenshot-desktop.

After capturing, use `view_image` to see the screenshot and describe what's on screen.

**Linux caveat:** Requires ImageMagick — if capture fails, run `sudo apt install imagemagick`.
