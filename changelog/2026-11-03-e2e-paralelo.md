# Parallel e2e — 2026-11-03 (épico `epic/e2e-paralelo`, PR #398, MCP 0.13.0, schema v13)

## Alterado

- The CI `e2e` job uses 3 workers (before, 2) and only installs Chromium's system libraries when it does not open. No test was removed, skipped or weakened; the app and the MCP do not change.
