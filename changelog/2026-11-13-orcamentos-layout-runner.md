# Layout budgets measured on the runner — 2026-11-13 (epic `epic/orcamentos-layout-runner`, PR #1811, MCP unchanged, schema v19)

## Alterado

- The ceilings of the two 4 ms layout budgets (grid with text and intrinsic nested 3 levels deep, `test:perf`) are now measured on the runner: 6 and 6.5 ms (the highest value of the 1st attempt on CI × 1.25, rounded to 0.5 ms). Only the tests change; nothing changes for whoever uses the app or the MCP.
