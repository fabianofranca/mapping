# The overdue check looks at the CI cycle — 2026-11-14 (epic `epic/ciclo-ci-atrasadas`, PR #1887, MCP unchanged, schema v19)

## Alterado

- **The `implementar-fila` overdue check now looks at the phase that is working in a red CI cycle (for whoever drives the flow, #1884):** with the phase PR open, the cycle's subagent (Sonnet) reads the PR's commits since it was opened and the CI of each; with 3 or more red commits, or the same failure (same job and same message) in 2 consecutive commits, an Opus subagent reads only the summary (never the transcript) and says in up to 6 lines whether it is a cycle, the probable cause and the direction. If it is a cycle, the coordinator sends the direction to the phase by `send_message` with `priority: "now"`; a direction that touches a file outside the sub-issue's "Toca em:" goes to the owner through the question picker. At most one diagnosis per phase every 60 min. No new script; the rule on the phase side stays out (it depends on #1856).
