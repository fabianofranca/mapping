# Stable growth tests — 2026-11-09 (epic `epic/escala-estavel`, PR #1212, MCP 0.28.11, schema v18)

## Alterado

- Growth tests (`npm run test:scale` and the growth cases of `npm run test:perf`): interleaved n/4n measurement (gc per pair, alternating order, same warm-up at both sizes) and a 6× ceiling calibrated by measurement; only the tests change, nothing changes for whoever uses the app or the MCP.

## Corrigido

- Viewer and component editor: updating a screen with thousands of instances no longer costs quadratic time (the drawing order, `renderOrder`, is now computed in a single pass; the order does not change). The MCP goes up to 0.28.11 only because `src/model/components/screen.ts` ships in the release; the rest of the stage changes only tests.
