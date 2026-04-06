---
name: obsidian
description: Read, search, create, and organize notes in an Obsidian vault. Use when the user references their vault, notes, daily notes, or knowledge base.
---

Obsidian vaults are folders of markdown files. Read and write them directly via the filesystem — no API needed.

## Vault location

Check MEMORY.md for the vault path. If not set, ask the user. Common locations:

- macOS: `~/Documents/Obsidian/VaultName/` or `~/ObsidianVault/`
- Linux: `~/Obsidian/VaultName/` or `~/Documents/Obsidian/`

The `.obsidian/` subfolder confirms a directory is a vault.

## Important

- Always exclude `.obsidian/` and `.trash/` from file searches and operations.
- Match the vault's existing conventions (frontmatter style, tag format, folder structure) — check a few existing notes first.
- Don't reorganize the vault structure unless asked.
