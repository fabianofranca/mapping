# The queue coordinator asks its in-run questions by text — [Não lançado] (épico `epic/queue-questions-by-text`, PR #0, MCP unchanged, schema v20)

## Adicionado

- **`painel.py pergunta` and the `perguntas ao dono:` line of `show` (for whoever drives the flow, #2070):** `pergunta <folder> '#n' <segurar|reabrir|refazer|ampliar> texto="…"` records an open owner question of a queue row in `meta.perguntas`, `pergunta … --fim [resposta="…"]` closes it with a `log` line, and a final `row` status closes the row's questions. `show` prints `perguntas ao dono: <k>` (or `nenhuma`) after `pedidos do supervisor:`, with the type B supervisor requests in `perguntado ao dono`, and `show '#n'` prints the row's questions. `import` brings the questions of the rows it imports. An open question changes nothing in the slots.

## Alterado

- **The coordinator's in-run questions are asked by text (for whoever drives the flow, #2070):** holding a stage (`segurar`/`seguir #<n>`), a supervisor type B request (`aprovar`/`negar SUP-<k>`), a CI stuck in the queue (`reabrir`/`esperar #<n>`, in place of the owner's "sim"), an incomplete ficha after the redo (`refazer`/`tirar #<n>`) and a CI-cycle direction outside the "Toca em:" (`ampliar`/`manter #<n>`) no longer use the question picker, which blocked the coordinator's turn and with it the phase and tester notices and the hourly check. Each is a notification, one line in the queue chat and a mark on the panel; the queue goes on, and the open ones are reposted in a new session and listed in the End table.
