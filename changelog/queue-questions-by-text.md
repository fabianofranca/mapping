# The queue coordinator asks its in-run questions by text — [Não lançado] (épico `epic/queue-questions-by-text`, PR #0, MCP unchanged, schema v20)

## Adicionado

- **`painel.py pergunta` and the `perguntas ao dono:` line of `show` (for whoever drives the flow, #2070):** `pergunta <folder> '#n' <segurar|reabrir|refazer|ampliar> texto="…"` records an open owner question of a queue row in `meta.perguntas`, `pergunta … --fim [resposta="…"]` closes it with a `log` line, and a final `row` status closes the row's questions. `show` prints `perguntas ao dono: <k>` (or `nenhuma`) after `pedidos do supervisor:`, with the type B supervisor requests in `perguntado ao dono`, and `show '#n'` prints the row's questions. `import` brings the questions of the rows it imports. An open question changes nothing in the slots.
