---
name: obsidian
description: Read, search, create, and organize notes in an Obsidian vault. Use when the user references their vault, notes, daily notes, or knowledge base.
---

Obsidian vaults are folders of markdown files — no API needed. Read and write them directly.

## Setup

The vault path is stored in MEMORY.md. If not set, ask the user where their vault is. Common locations:

- macOS: `~/Documents/Obsidian/VaultName/` or `~/ObsidianVault/`
- Linux: `~/Obsidian/VaultName/` or `~/Documents/Obsidian/`
- The `.obsidian/` subfolder confirms it's a vault

Once found, write it to this skill's MEMORY.md so you don't have to ask again.

## Reading notes

Notes are `.md` files. Many have YAML frontmatter between `---` delimiters:

```markdown
---
tags: [project, active]
date: 2026-04-05
status: in-progress
---

# Note content here
```

Read files directly. Search across the vault with `grep -r` or `find`:

```bash
# Find notes by name
find "$VAULT" -name "*.md" | grep -i "meeting"

# Search content across all notes
grep -rli "project atlas" "$VAULT" --include="*.md"

# Find recent notes (modified in last 7 days)
find "$VAULT" -name "*.md" -mtime -7 -not -path "*/.obsidian/*" -not -path "*/.trash/*"
```

Always exclude `.obsidian/` and `.trash/` from searches.

## Creating and editing notes

Write markdown files directly. Respect the vault's existing conventions — check a few existing notes first to match their frontmatter style, tag format, and folder structure.

```bash
# Create a new note
cat > "$VAULT/New Note.md" << 'EOF'
---
date: 2026-04-06
tags: [meeting]
---

# Meeting Notes

Content here.
EOF
```

**Daily notes** are typically at `$VAULT/Daily notes/YYYY-MM-DD.md` — check the vault for the actual folder name and date format. Append to today's daily note rather than overwriting:

```bash
echo -e "\n## Added by Shrok\n\nNew content here." >> "$VAULT/Daily notes/2026-04-06.md"
```

## Wikilinks

Obsidian uses `[[Note Name]]` for internal links. When creating notes, link to existing notes where relevant. Check if a note exists before linking:

```bash
find "$VAULT" -name "*.md" -not -path "*/.obsidian/*" | sed 's|.*/||;s|\.md$||' | grep -i "search term"
```

When moving or renaming a note, update wikilinks in other files that reference it:

```bash
# Find all notes linking to "Old Name"
grep -rli "\[\[Old Name\]\]" "$VAULT" --include="*.md"
# Then sed to update them
```

## Tags

Tags appear as `#tag` inline or `tags: [tag1, tag2]` in frontmatter. List all tags in the vault:

```bash
grep -roh '#[a-zA-Z0-9/_-]\+' "$VAULT" --include="*.md" | sort | uniq -c | sort -rn | head -20
```

## Tasks

Obsidian tasks use standard markdown checkboxes:
- `- [ ] Incomplete task`
- `- [x] Completed task`

Find open tasks across the vault:

```bash
grep -rn "^- \[ \]" "$VAULT" --include="*.md" | grep -v ".obsidian" | grep -v ".trash"
```

## Key conventions

- **Don't reorganize the vault** unless asked. People are particular about their vault structure.
- **Match existing style** — if their notes use `#tags`, use that. If they use `tags:` in frontmatter, use that.
- **Link generously** — wikilinks are how Obsidian builds its graph. When creating notes, link to related existing notes.
- **Preserve frontmatter** — when editing a note, keep existing frontmatter intact. Add to it, don't replace it.
- **Report in context** — when summarizing or searching, include the note name and relevant excerpt, not just "I found 12 results."
