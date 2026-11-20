# Queue ignores append-only index citations — 2026-11-20 (epic `epic/queue-append-only`, PR #2329, MCP unchanged, schema unchanged)

## Alterado

- The queue no longer holds a stage because it shares an append-only index citation with a started one: `APPEND_ONLY` in `painel.py` (`docs/MCP.md#tools`, `docs/AGENT-GUIDE.md#changing-a-project-proposals-for-review`, `.claude/skills/spec-author/SKILL.md#method`, `docs/ARCHITECTURE.md#where-everything-lives`, `docs/TESTING.md#start-here`, `docs/TESTING.md#8-test-scripts`, `tests/tooling/roundBlocks.test.ts`, `src/i18n/en-US.ts`, `src/i18n/pt-BR.ts`) leaves the comparison of `vagas:`, `começar agora:`, `conflito` and the graph's waves.
