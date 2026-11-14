# Workspace AGENTS.md fixed — 2026-11-08 (epic `epic/agents-md-biblioteca`, PR #873, MCP 0.28.0 no change, schema v18)

## Corrigido

- The rules block of the workspace's `AGENTS.md` said that `propose_changes` refuses a library (v4 package). Now it says what the server does: the validated folder goes to the person, who applies it in the app or asks the agent to propose it with `apply_specialization` (or `update_specialization`, for a major version), with `file` = the folder; in an update, `plan_library_update` shows the impact beforehand. The "Structure" table also says what `setup.sh` does with `.claude/skills/spec-author` (a link to the skill folder, or a copy where links do not exist). The text reaches the workspaces through the `setup.sh` of the next MCP release.
