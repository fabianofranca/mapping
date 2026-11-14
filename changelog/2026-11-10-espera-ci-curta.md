# Shorter CI wait — 2026-11-10 (épico `epic/espera-ci-curta`, PR #1457, MCP 0.30.0 unchanged, schema v18)

## Alterado

- Automated flow (`docs/FLOW.md`, "Para a sessão da fase", item 6): the session waiting for CI (phase, fix and closing) checks 4 min after the push and, with CI still running, every 2 min up to 20 min of waiting; after that, every 8 min. Before, it was an 8 min `send_later`, and PR CI (~3 min) left the session idle with CI already green. `subscribe_pr_activity` stays.
- CI reading (`docs/FLOW.md`, item 6, and the `implementar-fila` skill, epic PR check): through `get_check_runs`, never `get_status` (the repository does not use commit statuses, and it stays `pending` forever), ignoring the `skipped` check runs from editing the PR title/body and from the snapshot cleanup; green CI is the `check` with `success` and no other with `failure`, `cancelled` or `timed_out`.
- `implementar-fila` skill: the "Pior caso de detecção" line cites the new CI wait as the first safety net.
