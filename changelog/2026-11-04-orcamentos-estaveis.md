# Stable budgets — 2026-11-04 (epic `epic/orcamentos-estaveis`, PR #408, MCP 0.13.0, schema v13)

## Corrigido

- The performance budget "pan, zoom and edit with 200 arrows" (16 ms, `retry: 1`, both equal) is now measured like its siblings: 3 discarded warm-up rounds and the median of 15 samples per metric, with the metric in the `expect`. The name says what is measured (the large project).
- In `npm test`, the 3 budget files run in their own Vitest projects, after the rest of the suite and one file at a time, without competing for CPU with it. `test:perf`, `test:coverage`, the CI shards and `PERF_BUDGETS=off` do not change. No test was removed, skipped or weakened; the app and the MCP do not change.
