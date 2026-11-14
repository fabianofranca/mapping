# Queue watcher in the supervisionar-fila skill — 2026-11-12 (epic `epic/observador-da-fila`, PR #1702, MCP 0.36.0 unchanged, schema v18)

## Corrigido

- The "Watching a condition" section of the `supervisionar-fila` skill describes the watcher that exists: the scheduled task "Mapping - Workflow Insights" (`trig_01YXXNz6596nCkk9vsyrvPgp`), which runs once a day, at 12:00 Brasília time, in a new session on each firing. Before, the skill cited a schedule that no longer exists and a "every 6 h" firing, and a supervision that followed only the text looked for the wrong id.
- Only the owner changes the watcher's name, time, model, connectors, prompt and stop, through the scheduled tasks screen, because the schedule was created there and `update_trigger` refuses to edit it. The skill tells the supervision to write the new text in the chat, wait for the owner to apply it and check with `get_trigger`, without trying `update_trigger` or deleting and recreating. The tasks that the supervision itself creates (`create_trigger`) are still editable by `update_trigger`.
- The skill stops asserting the watcher's model (the owner chooses it on the screen) and does not repeat the scheduled prompt, which is still read through `get_trigger`. `tests/tooling/supervisorSkill.test.ts` checks these points.
