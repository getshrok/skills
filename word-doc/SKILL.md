---
name: word-doc
description: Create, read, and edit Word documents (.docx). Use when the user needs reports, letters, resumes, proposals, or any formatted document.
skill-deps:
  - code-execution
---

**Packages:** docx (create), mammoth (read), jszip (edit existing via XML).

Install into a temp dir per the code-execution skill pattern. Save output to `$WORKSPACE_PATH/media/`.

## Tables — DXA width gotcha

Table widths use DXA units (1 inch = 1440 DXA), never percentages (percentages break in Google Docs). US Letter with 1" margins = 9360 DXA usable width. Set widths on both the table (`columnWidths`) and every cell (`width: { size, type: WidthType.DXA }`). Column widths must sum exactly to usable page width.

## Editing existing documents

The `docx` library creates from scratch only — it cannot open/modify existing files. For edits:
- Extract with mammoth, rebuild with docx (loses some formatting)
- For surgical edits: use jszip to unzip the .docx, edit XML in `word/document.xml`, re-zip. Text can be split across multiple XML runs — never assume one sentence = one node.
