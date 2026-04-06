---
name: spreadsheet
description: Create, read, edit, and analyze spreadsheets (.xlsx, .csv). Use when the user needs tabular data work — budgets, reports, logs, data cleanup, exports.
skill-deps:
  - code-execution
---

**Packages:** exceljs for .xlsx, Node.js builtins for .csv.

Install into a temp dir per the code-execution skill pattern. Save output to `$WORKSPACE_PATH/media/`.

**Use formulas, not hardcoded values.** If a cell should be a sum, write `{ formula: 'SUM(B2:B10)' }` — not the computed number. Keeps the spreadsheet useful after the user edits it.
