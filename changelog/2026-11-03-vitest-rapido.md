# Faster Vitest — 2026-11-03 (épico `epic/vitest-rapido`, PR #402, MCP 0.13.0, schema v13)

## Alterado

- The CI tests run in 4 shards balanced by each file's time (before, 2 shards split by number of files), and the shards no longer generate the coverage report: only the `coverage` job generates it, by merging the blobs. Coverage remains on every PR, with the same artifact and the same summary. No test was removed, skipped or weakened; the app and the MCP do not change.
- The Vitest projects stop applying the `vite.config.ts` plugins twice (the "applies the same plugin multiple times" warning goes away).
- `npm run test:durations` regenerates the per-file times used to split the shards.
