# The coordinator asks the owner to archive when Auto mode denies it — [Não lançado] (épico `epic/archive-denied-ask`, MCP unchanged, schema v23)

## Adicionado

- The `implementar-fila` skill ("Archive the sessions") now has a paragraph "Archiving denied by Auto mode": when the classifier denies `archive_session`, the session stays pending, the `log` records it and the coordinator asks the owner once, by text and without holding the queue, to answer `pode arquivar` (or `não arquive`). It asks again only with 10 or more pending sessions and at least 3 h after the last ask, and the authorization does not carry over to a successor. `docs/FLOW.md` lists the two answers and a text test keeps the key phrases.
