---
name: pdf
description: Create, read, edit, merge, split, and fill PDF files. Use when the user needs to generate reports, extract text from PDFs, combine documents, or fill out forms.
skill-deps:
  - code-execution
---

**Packages:** pdfmake (create), pdf-parse (read/extract text), pdf-lib (edit/merge/split/fill forms).

Install into a temp dir per the code-execution skill pattern:

```bash
TMPDIR=$(mktemp -d)
cd "$TMPDIR" && npm init -y --quiet && npm install --quiet pdfmake pdf-parse pdf-lib
node script.mjs
cp output.pdf "$WORKSPACE_PATH/media/"
rm -rf "$TMPDIR"
```

Save output to `$WORKSPACE_PATH/media/`.
