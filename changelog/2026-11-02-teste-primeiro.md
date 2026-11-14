# Test first and complexity gate — 2026-11-02 (épico `epic/teste-primeiro`, PR #321, MCP 0.12.0, schema v13)

## Adicionado

- Per-function complexity gate: the ESLint `complexity` rule (limit 10, error) applies in `src/**` and `mcp/**` and runs in the CI's `npm run lint`. The 319 legacy functions above the limit are in `eslint-suppressions.json`, which can only shrink (`npx eslint --prune-suppressions` when one is reduced). A tooling test proves the rule catches in `src/` and `mcp/` and does not apply in `tests/`, `scripts/`, `viewer/` and `pwa/`.

## Alterado

- For whoever develops with agents: the subagent briefing and the phase session message now require **test first** for a behavior change or fix (test seen failing before the code; the return carries the test name and the failure). Refactoring, documentation and mechanical work only require the existing tests passing before and after.
- Nothing changes in the app or in the MCP server.
