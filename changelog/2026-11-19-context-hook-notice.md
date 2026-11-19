# Context hook notice — 2026-11-19 (épico `epic/context-hook-notice`, PR #2168, MCP 0.43.0 unchanged, schema v20)

## Alterado

- The context hook's notice (`scripts/ci/contextGuard.mjs`) now exempts only the phase's last PR, the same rule as the "Phase context ceiling" sub-item of `docs/FLOW.md`: a phase that opens several PRs hands over between a merged PR and the next one, and only the phase's last PR open (or session 5 of 5) carries on above the trigger. Before, any open phase PR exempted it (#1949).
