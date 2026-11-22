# Coordinator chat title shows the lineage level — [Não lançado] (épico `epic/coordinator-title-lineage`, PR #2557, MCP unchanged, schema v23 unchanged)

## Alterado

- the queue coordinator's chat title is now `Fila — coordenador <n> · linhagem <depth>/<limit>`, read from `lineage.depth` and `lineage.limit` of `get_session` (a chat the owner opens is level 0), so the owner sees from the session list how deep in the lineage the current coordinator is; the successor created at a session switch is born with `<depth> + 1` and sets its own title again from its own `get_session`
