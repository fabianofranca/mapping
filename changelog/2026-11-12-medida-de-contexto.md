# Context measurement through the transcript — 2026-11-12 (épico `epic/medida-de-contexto`, PR #1709, MCP 0.36.0 unchanged, schema v18)

## Corrigido

- The phase's context ceiling (300 thousand) now works: the session measures the context with `node scripts/ci/contextUsage.mjs`, which reads the usage of the last model call in the session's own local transcript and follows the turn in progress. Before, the measure was the `used_tokens` of `get_session`, which only changes at the end of a turn and was 0 throughout the phase; so no phase ever handed over, and the context reached 473 thousand.
- The phase's final notice carries the line `Contexto: <mil> mil` (or `Contexto: sem medida (<motivo>)`), measured right before the notice.
- The tester measures the context before each batch and before the notice, records the line `Contexto por lote: …` in "What got in the way" and ends the notice to the coordinator with `; contexto <mil> mil`. Nothing changes above the ceiling: recording without holding the round continues.
- The coordinator measures its own context with the script (`pct` with `--max`) at the fallback check and at the session handoff, and the queue supervision measures the base and the ~50% the same way.
- When archiving each child, the coordinator reads its `get_session` only with the turn finished (`status_bucket` other than `working`) and compares the context read with the one in the notice: outside a difference of 0 to 15 thousand, the queue `log` records "medida de contexto divergente" and the stage goes on.
- The ceilings do not change (300 thousand for the phase and the tester, 35% for the coordinator, ~50% for the supervision), nor do `painel.py`, `docs/PROCESS.md` and `CLAUDE.md`.
