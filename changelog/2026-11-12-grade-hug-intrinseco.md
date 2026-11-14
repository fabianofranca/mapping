# Hug grid under a max-content/min-content parent proven by test — 2026-11-12 (épico `epic/grade-hug-intrinseco`, PR #1768, MCP 0.38.2, schema v19)

## Alterado

- The `hug` grid with `minColumnWidth` under a `max-content`/`min-content` parent is proven by a test (`tests/model/components/huggedCounts.test.ts`, #1749), with the same track count as a parent of the same width in px, in `column` and `row` and in both measuring orders. The `huggedCounts` comment in `src/model/components/instantiate.ts` no longer says that this parent may still be wrong. Nothing changes for whoever uses the app or the MCP.
