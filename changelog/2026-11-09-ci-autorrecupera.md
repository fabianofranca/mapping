# CI that recovers by itself — 2026-11-09 (épico `epic/ci-autorrecupera`, PR #1353, MCP 0.28.15, schema v18)

## Adicionado

- `.github/workflows/ci-rerun.yml` (`CI: rerun of abandoned runner`): when the CI of a PR in the repository ends red on attempt 1 only because GitHub abandoned a runner, it reruns the missing jobs, once; a legitimate failure and a timeout are not rerun. The rule is in `scripts/ci/ciRerun.mjs`. It only takes effect after the merge into `main`.
- The last step of the `build` job shows the margin of `dist/index.html` up to the ceiling in the summary and warns (`::warning`) below 2 KiB.

## Alterado

- Every job in `ci.yml` gained `timeout-minutes` (epic 3, static 4, test 6, coverage 3, build 7, check 2, e2e 7): a stuck job stops and the required check ends red.
- The `dist/index.html` size step moved to the end of `build`, after `build:mcp` and `build:viewer`.
