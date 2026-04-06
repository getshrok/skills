---
name: pdf
description: Create, read, edit, merge, split, and fill PDF files. Use when the user needs to generate reports, extract text from PDFs, combine documents, or fill out forms.
skill-deps:
  - code-execution
---

Three npm packages cover all PDF work. Install into a temp dir per the code-execution skill pattern:

```bash
TMPDIR=$(mktemp -d)
cd "$TMPDIR" && npm init -y --quiet && npm install --quiet pdfmake pdf-parse pdf-lib
node script.mjs
cp output.pdf "$WORKSPACE_PATH/media/"
rm -rf "$TMPDIR"
```

Save generated files to `$WORKSPACE_PATH/media/` so the user can access them from the dashboard.

## Which library for what

| Task | Library |
|------|---------|
| **Create** new PDFs (reports, letters, invoices) | **pdfmake** |
| **Read** / extract text from existing PDFs | **pdf-parse** |
| **Edit** existing PDFs (merge, split, fill forms, add pages) | **pdf-lib** |

Don't mix them up — pdfmake creates from scratch, pdf-lib modifies existing files.

## Creating PDFs with pdfmake

pdfmake uses a JSON document definition. This is the primary tool for generating reports, invoices, letters, etc.

```js
import pdfmake from 'pdfmake/build/pdfmake.js'
import pdfFonts from 'pdfmake/build/vfs_fonts.js'
import fs from 'fs'
pdfmake.vfs = pdfFonts.vfs

const doc = pdfmake.createPdf({
  content: [
    { text: 'Monthly Report', style: 'header' },
    { text: 'Summary of Q1 results.\n\n' },
    {
      table: {
        headerRows: 1,
        widths: ['*', 'auto', 'auto'],
        body: [
          ['Category', 'Budget', 'Actual'],
          ['Marketing', '$5,000', '$4,800'],
          ['Engineering', '$12,000', '$11,500'],
        ],
      },
    },
  ],
  styles: {
    header: { fontSize: 18, bold: true, margin: [0, 0, 0, 10] },
  },
})

doc.getBuffer((buffer) => {
  fs.writeFileSync('output.pdf', buffer)
})
```

pdfmake supports: text, tables, lists, columns, images (base64), headers/footers, page numbers, watermarks, links, and table of contents.

## Reading PDFs with pdf-parse

```js
import fs from 'fs'
import pdf from 'pdf-parse/lib/pdf-parse.js'
const buffer = fs.readFileSync(filepath)
const data = await pdf(buffer)
console.log(data.text)      // full extracted text
console.log(data.numpages)  // page count
```

Report extracted content back as markdown. For tabular data in PDFs, the text extraction may lose column alignment — warn the user if the result looks messy.

## Editing PDFs with pdf-lib

```js
import { PDFDocument } from 'pdf-lib'
import fs from 'fs'

// Merge two PDFs
const pdf1 = await PDFDocument.load(fs.readFileSync('file1.pdf'))
const pdf2 = await PDFDocument.load(fs.readFileSync('file2.pdf'))
const merged = await PDFDocument.create()
for (const src of [pdf1, pdf2]) {
  const pages = await merged.copyPages(src, src.getPageIndices())
  pages.forEach(p => merged.addPage(p))
}
fs.writeFileSync('merged.pdf', await merged.save())

// Fill a form
const doc = await PDFDocument.load(fs.readFileSync('form.pdf'))
const form = doc.getForm()
form.getTextField('name').setText('Alice')
form.getCheckBox('agree').check()
fs.writeFileSync('filled.pdf', await doc.save())
```

pdf-lib can also: split PDFs (copy specific pages), add/remove pages, embed images, draw text/shapes on existing pages, read form field names, and flatten forms.
