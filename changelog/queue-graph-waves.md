# Queue graph waves — [Não lançado] (épico `epic/queue-graph-waves`, PR #0, MCP unchanged, schema v23)

## Corrigido

- The waves of the queue graph now apply the file and schema conflicts: two waiting stages with a file in common (same rule as the slots, with the ignored and append-only citations) or that both change the schema no longer share a wave; rows with `hold` or an incomplete ficha neither block nor are blocked, and the slots do not cut a wave.
