# High effort in detailing — 2026-11-09 (epic `epic/esforco-detalhamento`, PR #1161, MCP 0.28.6, schema v18)

## Alterado

- `/detalhar-backlog`: the unit whose detailing calls for high effort (schema or format, writing `mapping.json`, cross-cutting architecture, a large plan) is put to the owner as a question, and the recommendation is for the skill to hand over a ready prompt for them to open the session in Opus at high effort, because the child session does not choose the effort. The opened session notifies the coordinator at start and at finish. New argument: `alto=#a,#b` forces high on those issues, and `alto=nenhum` turns the rule off.
- `/detalhar-backlog`: before saving the plan, each detailing checks it against the `main` code (files, versions, scripts, phases the size of one session and overlap with the other `ready` and `in-progress`), and the ready notice says what the check corrected.
