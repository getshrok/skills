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
- For surgical edits: use jszip to unzip the .docx, edit XML in `word/document.xml`, re-zip.

## XML editing pitfalls (critical)

- **Never split on `<w:p>` naively.** Paragraphs appear inside tables (`<w:tbl>`) too. Splitting by `<w:p>` mixes top-level body paragraphs with table cell content and will corrupt the document.
- **Use a real XML parser** (like `fast-xml-parser` or the DOM API) to find direct children of `<w:body>`. Don't use string splitting or regex to locate insertion points.
- **Text spans multiple runs.** One word can be split across `<w:r>` elements — never assume one sentence = one node.
- **Validate after editing.** Re-read the XML after writing to confirm it's well-formed. Corrupt XML produces files that silently fail to open.
