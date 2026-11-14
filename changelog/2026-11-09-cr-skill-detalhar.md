# CR of the detailing skill — 2026-11-09 (épico `epic/cr-skill-detalhar`, PR #1218, MCP 0.28.10 unchanged, schema v18)

## Alterado

- `/detalhar-backlog` now handles the group that joins `bug` and `roadmap`: the main one is the `bug` of highest severity (on a tie, the lowest number), and the stage becomes `bug` with the group's highest severity, without `impact:`.
- `/detalhar-backlog` says what to do with the open `step` sub-issues of a `ready` that enters a group or has its plan changed: the phase that continues moves to the main one and is updated, the one that leaves closes as `not_planned` with a comment, and the `PRONTA` check verifies that no open `step` was left hanging.
- `/detalhar-backlog` has `ToolSearch` load only `PushNotification`; `AskUserQuestion` only if it is a deferred tool.
- The `changelog/` rule provides for the epic of only the delivery flow: the categories speak to whoever drives the flow (the owner and the agents).
