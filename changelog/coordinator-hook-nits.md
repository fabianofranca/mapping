# Coordinator context hook nits — [Não lançado] (épico `epic/coordinator-hook-nits`, PR #2621, MCP unchanged, schema v23 unchanged)

## Alterado

- the context hook only classes a session as the queue coordinator when the typed `/implementar-fila` command tag opens a prompt block (an optional `<command-message>` first); a prompt that merely quotes the tag stays silent
- the coordinator notice no longer promises that later notices do not repeat: it says the hook cannot see the lineage and repeats every 10 thousand, and tells the coordinator to skip the owner notification when the panel's `current` already says the owner was notified
- the coordinator keeps the cheap `git diff --quiet` check of `.claude/skills/implementar-fila/` when it switches session above 35%, and reads only the "Session switch" and "Rules of this queue" sections when the change on `main` touches them
