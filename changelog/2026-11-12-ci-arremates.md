# CI finishing touches — 2026-11-12 (épico `epic/ci-arremates`, PR #1753, MCP unchanged, schema v19)

## Alterado

- The "Tamanho do dist/index.html" step of `ci.yml` reads the ceiling only from `scripts/ci/dist-budget.json`. The plan B that read the `INDEX_HTML_MAX_BYTES` line from the checkout's own `ci.yml` is gone: a ref earlier than stage #1614 (for example a manual preview of an old Dependabot PR) fails with the `::error` "ref anterior à etapa #1614: traga a main", and the fix is to bring in `main`.
- `scripts/ci/distBudget.mjs`, which holds the guards and the limits of the ceiling, triggers the `/code-review high` at the epic's closing (`scripts/ci/riskTriggers.mjs` and "Detailing effort" of the `detalhar-backlog` skill). `scripts/ci/dist-budget.json`, which the raise writes, stays out of the triggers.
- The comments in `ci.yml` and `ci-rerun.yml` state the real mechanism of the timeout: the job that exceeds `timeout-minutes` ends `cancelled`, the CI run ends `cancelled` (not `failure`) and `ci-rerun.yml` is skipped by the `if:`. `ci-rerun.yml` also records how the demonstration of stage #1532 was assembled.
