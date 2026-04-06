---
name: spreadsheet
description: Create, read, edit, and analyze spreadsheets (.xlsx, .csv). Use when the user needs tabular data work — budgets, reports, logs, data cleanup, exports.
skill-deps:
  - code-execution
---

Use the **ExcelJS** npm package for .xlsx work and Node.js builtins for .csv. Install into a temp dir per the code-execution skill pattern:

```bash
TMPDIR=$(mktemp -d)
cd "$TMPDIR" && npm init -y --quiet && npm install --quiet exceljs
node script.mjs
# copy output file to workspace before cleanup
cp output.xlsx "$WORKSPACE_PATH/media/"
rm -rf "$TMPDIR"
```

Save generated files to `$WORKSPACE_PATH/media/` so the user can access them from the dashboard.

## Key principles

- **Use formulas, not hardcoded values.** If a cell should be a sum, write `{ formula: 'SUM(B2:B10)' }` — not the computed number. Keeps the spreadsheet useful after the user edits it.
- **Read before writing.** When editing an existing file, read it first to understand the structure. Don't assume column order or sheet names.
- **Markdown tables for reporting back.** When the user asks "what's in this spreadsheet?", format the answer as a markdown table — don't just dump JSON.

## Common operations

**Create a new workbook:**
```js
import ExcelJS from 'exceljs'
const wb = new ExcelJS.Workbook()
const ws = wb.addWorksheet('Sheet1')
ws.columns = [
  { header: 'Name', key: 'name', width: 20 },
  { header: 'Amount', key: 'amount', width: 15 },
]
ws.addRows([{ name: 'Alice', amount: 100 }, { name: 'Bob', amount: 200 }])
// Formula example
ws.addRow({ name: 'Total', amount: { formula: 'SUM(B2:B3)' } })
await wb.xlsx.writeFile('output.xlsx')
```

**Read an existing file:**
```js
const wb = new ExcelJS.Workbook()
await wb.xlsx.readFile(filepath)
const ws = wb.getWorksheet(1) // by index or name
ws.eachRow((row, rowNum) => { console.log(rowNum, row.values) })
```

**Formatting:** ExcelJS supports bold, colors, borders, number formats, alignment, column widths, merged cells, and conditional formatting. Apply formatting after adding data.

**CSV:** For simple CSV work, Node.js builtins are enough — `fs.readFileSync` + split on newlines and commas. Use ExcelJS only when you need .xlsx features (formulas, formatting, multiple sheets).
