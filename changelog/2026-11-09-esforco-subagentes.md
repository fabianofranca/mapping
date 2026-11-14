# Effort under the queue's control — 2026-11-09 (épico `epic/esforco-subagentes`, PR #1278, MCP 0.28.12, schema v18)

## Alterado

- `/detalhar-backlog` details each unit (and the grouping) in an Opus subagent of the `Agent` tool, in the background, with the effort chosen by the skill's criteria (`high` or `medium`; `alto=` adds, `alto=nenhum` puts everything at `medium`). The "Effort" question, the ready prompt for the owner to open the session and the prompt checks are gone. Reports come back through the subagent's return and the owner's answers go by `SendMessage` to the same subagent.
- A single 60 min backup check in detailing; on the third time without news from the same subagent (3 h) the coordinator asks the owner whether to go on without it or recreate it (with the answers already given).
- The phase whose coordinator asks for `high`, `xhigh` or `max` effort runs `/code-review` at that level over its diff before the PR, and the PR Summary carries the review line (`docs/FLOW.md`, "For the phase session"; `/implementar-fila` adds the item).
