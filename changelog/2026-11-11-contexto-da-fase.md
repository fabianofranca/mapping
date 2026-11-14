# Phase context ceiling — 2026-11-11 (epic `epic/contexto-da-fase`, PR #1655, MCP 0.35.0 unchanged, schema v18)

## Adicionado

- `docs/FLOW.md`, "Para a sessão da fase", item 3: the sub-item **Teto de contexto da fase**. The phase session (and the fix one) checks its own context (`context_usage.used_tokens` of `get_session` without `session_id`) before sending a new task to a subagent and before the gates; above 300 thousand and before opening the PR, it waits for the subagents, makes a `WIP <código>: passagem por contexto` commit and push, comments the handoff on the sub-issue (`Passagem da fase <código> (contexto <n> mil):`) and asks the coordinator for the swap. After the PR is open there is no swap.
- Skill `implementar-fila`, "3. Por etapa": the paragraph **Fase que passa a vez por contexto**. The coordinator creates the successor (same `model`, `effort` and `source_revision`, title with ` · retomada <k>`, phase message with the line `Retomada por contexto (<k> de 3)`), writes `child=`, `session … kind=fase label=<código>` and the log in the panel, and archives the previous one with the cost written first. At most 2 swaps per phase: the `3 de 3` session does not swap.
- `tests/tooling/queuePhaseContext.test.ts`: a text test that checks these rules.

## Alterado

- `docs/FLOW.md`, "Orquestrador — passo a passo", paragraph "Limites": the orchestrator of a stage answers the phase's swap request only in the same way (creates the successor and archives the previous one).
- Skill `implementar-fila`, "Arquivar as sessões" › "O que não se arquiva": the child that passed the turn by context is archived when the successor is created.
- Nothing changes in the app, in the MCP server, in the schema, in `docs/PROCESS.md`, in `CLAUDE.md` or in `painel.py`.
