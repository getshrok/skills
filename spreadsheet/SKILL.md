---
name: spreadsheet
description: Create, read, edit, and analyze spreadsheets (.xlsx, .csv). Use when the user needs tabular data work — budgets, reports, logs, data cleanup, exports.
---

**Package:** exceljs (for .xlsx). Node.js builtins for .csv.

Install into a temp dir so the workspace stays clean:

```bash
TMPDIR=$(mktemp -d)
cd "$TMPDIR" && npm init -y --quiet && npm install --quiet exceljs
node script.mjs
cp output.xlsx "$WORKSPACE_PATH/media/"
rm -rf "$TMPDIR"
```

Save output to `$WORKSPACE_PATH/media/`. When editing an existing file, copy it into the temp dir first, edit it there, then copy it back.

**Use formulas, not hardcoded values.** If a cell should be a sum, write `{ formula: 'SUM(B2:B10)' }` — not the computed number. Keeps the spreadsheet useful after the user edits it.
