# Parallel tester — 2026-11-04 (épico `epic/testador-paralelo`, PR #470, MCP 0.14.0, schema v13)

## Adicionado

- **Full tester round in 3 parallel blocks**, with a summary from the coordinator: the fixed split (blocks of 82, 92 and 95 steps, R0 in all three) lives in a table in `docs/TESTING-NUVEM.md` and is checked by a test against the steps of `docs/TESTING.md`; the "full, block k of 3" mode runs only the block's scripts, with a report and `k.n` findings per block; the orchestrator (or a standalone owner chat) creates the three sessions, waits for the three notices and posts the summary (✅, ❌ and not run per block, findings by severity, timings and links). The messages and the summary template are in `docs/FLOW.md`.
