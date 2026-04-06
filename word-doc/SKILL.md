---
name: word-doc
description: Create, read, and edit Word documents (.docx). Use when the user needs reports, letters, resumes, proposals, or any formatted document.
skill-deps:
  - code-execution
---

Use the **docx** npm package to create .docx files and **mammoth** to read existing ones. Install into a temp dir per the code-execution skill pattern:

```bash
TMPDIR=$(mktemp -d)
cd "$TMPDIR" && npm init -y --quiet && npm install --quiet docx mammoth
node script.mjs
cp output.docx "$WORKSPACE_PATH/media/"
rm -rf "$TMPDIR"
```

Save generated files to `$WORKSPACE_PATH/media/` so the user can access them from the dashboard.

## Reading existing .docx

Use mammoth to extract content as markdown or HTML:

```js
import mammoth from 'mammoth'
const result = await mammoth.convertToMarkdown({ path: filepath })
console.log(result.value)
```

## Tables (critical — break silently without these)

1. **Set widths on BOTH table and cells.** `columnWidths` on the table AND `width: { size, type: WidthType.DXA }` on every cell.
2. **DXA units only, never percentages.** Percentages break in Google Docs. 1 inch = 1440 DXA. US Letter with 1" margins = 9360 DXA usable.
3. **Column widths must sum exactly** to usable page width (9360 DXA for standard margins).
4. **`ShadingType.CLEAR` for backgrounds**, not `SOLID` (SOLID = black fill).
5. **Cell padding:** `margins: { top: 80, bottom: 80, left: 120, right: 120 }`.

## Editing existing documents

The `docx` library creates from scratch only — it cannot open and modify existing .docx files. For edits:
- Extract content with mammoth, rebuild with docx (loses some formatting)
- For surgical edits (tracked changes, preserving exact formatting), treat .docx as a ZIP of XML: unzip, edit the XML in `word/document.xml`, re-zip. Text can be split across multiple XML runs — never assume one sentence = one node.

## Gotchas

- **Styles over direct formatting.** Named styles keep documents editable. Stacking inline formatting creates fragile files.
- **Set page size explicitly.** A4 vs US Letter changes pagination, table widths, and header layout.
- **Lists use Word's numbering system**, not Unicode bullets. Pasting bullet characters creates fake lists that break on re-edit.
- **Headers/footers are per-section.** First-page and odd/even can differ. Fixing one header may not fix the document.
- **Copy-paste between docs imports foreign styles and numbering.** Can silently break formatting.
- **Report back with a summary** of what was created — sections, page count, key content. Not just "done".
