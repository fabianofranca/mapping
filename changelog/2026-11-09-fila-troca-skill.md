# Coordinator handoff on a new skill — 2026-11-09 (épico `epic/fila-troca-skill`, PR #1303, MCP 0.28.12, schema v18)

## Alterado

- `/implementar-fila`: when the skill changes on `main`, the coordinator hands the queue to a new session at the first check (between stages or at the hourly check), even below 60% of the context. This way the improvement applies right away, without a manual request. Phases and testers that are running do not change.
