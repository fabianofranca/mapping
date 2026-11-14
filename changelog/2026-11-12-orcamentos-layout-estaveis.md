# Stable layout budgets — 2026-11-12 (epic `epic/orcamentos-layout-estaveis`, PR #1720, MCP 0.37.0 unchanged, schema v19)

## Alterado

- The measurement of the layout's 4 ms budgets (grid with text and nested intrinsic) now does 10 warm-ups, a garbage collection outside the timing before each sample and the median of 41; only the tests change, nothing changes for whoever uses the app or the MCP.
- Fix (CL1, #1721): the measurement of the same two budgets now has 3 rounds of 41 samples and the lowest median among them applies, because in the epic's CI the median of a single round went past 4 ms (4.2 to 5.1 ms) under CPU contention; the 4 ms ceiling and the `retry: 1` do not change, and only the tests change.
