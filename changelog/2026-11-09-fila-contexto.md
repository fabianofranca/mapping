# Leaner queue coordinator — 2026-11-09 (épico `epic/fila-contexto`, PR #1290, MCP 0.28.12, schema v18)

## Alterado

- `/implementar-fila`: the coordinator spends far less context and lasts more hours per session. It no longer reads issue bodies (a subagent returns one sheet per stage, kept in the panel). The pre-merge PR check, the MCP Release check and the creation of the fix sub-issue also moved to subagents. There is one reserve check per hour for the whole session, instead of one per child. The phase message is short and points to `docs/FLOW.md`, and the panel is published once per notice.
- `/implementar-fila`: on a session handoff, the old session itself notifies the new coordinator's children, and the new one starts with only the arguments and the panel, without rereading issues or sessions.
- Queue panel (`painel.py`): the row stores the stage sheet (`plan`) and the children that owe a notice (`child`, `childAt`). The meta stores the reserve check (`reserve`). `show` lists the overdue children and shows a whole row with `show '#n'`.

## Corrigido

- `/implementar-fila`: the `painel.py` commands in the skill had the folder before the subcommand (`painel.py <folder> row`), and the script only accepts `painel.py row <folder>`.
