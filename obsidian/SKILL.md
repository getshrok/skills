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

## Excluding `.obsidian/` and `.trash/` from search

These dirs don't auto-hide — most search tools will surface them unless told not to. Always exclude both:

- ripgrep: `rg --glob '!.obsidian/' --glob '!.trash/' <pattern> <vault>`
- find: `find <vault> -type f -name '*.md' -not -path '*/.obsidian/*' -not -path '*/.trash/*'`
- glob: pattern out files under those subtrees explicitly

Same exclusion applies to bulk operations (rename, move, batch-edit) — never touch files in those folders.

## Wikilinks

Obsidian's canonical link syntax is `[[Note Name]]`, not standard markdown `[label](path)`. The vault's backlinks and graph view both depend on `[[]]` syntax. Use it for every internal link you create.

- Resolves by **basename** anywhere in the vault — `[[Shrok]]` finds `Projects/Shrok.md` regardless of where it's referenced from. No path needed.
- Display text: `[[Note Name|custom text]]`
- Section/block links: `[[Note Name#Heading]]` or `[[Note Name#^block-id]]`

## Tags

Two valid forms — the vault may use one or both, mirror what's already there:

- **Frontmatter:** `tags: [project, engineering]` — YAML array, **no `#` prefix**
- **Inline:** `#project` anywhere in the body — `#`-prefixed

Hierarchical tags use `/`: `#project/shrok`, `#status/active`. Both forms support hierarchy.

## Daily notes

Most vaults have a daily-notes workflow. Filenames are typically ISO `YYYY-MM-DD.md`.

To find the configured folder and date format, read `.obsidian/daily-notes.json` if it exists — keys are `folder` and `format`. Otherwise look for a top-level `Daily Notes/` or `Journal/` folder. Ask the user if neither pattern fits.

## Matching conventions when creating notes

Sample 2–3 existing notes **in the target folder** before writing a new one — frontmatter shape varies by note type (a Projects note may use `type: project, status: active`, while a daily note uses `date: ...`, while a People note uses `type: person`). Match the folder's pattern, not the vault's average.

## Things to avoid

- Don't reorganize the vault structure unless asked.
- Don't touch `.obsidian/` config files unless the user explicitly asks for a config change.
- Don't recover or modify files in `.trash/` — that's the user's deleted-notes graveyard.
