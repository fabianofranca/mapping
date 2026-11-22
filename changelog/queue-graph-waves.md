# Queue graph waves — [Não lançado] (épico `epic/queue-graph-waves`, PR #0, MCP unchanged, schema v23)

## Corrigido

- The waves of the queue graph now apply the file and schema conflicts: two waiting stages with a file in common (same rule as the slots, with the ignored and append-only citations) or that both change the schema no longer share a wave; rows with `hold` or an incomplete ficha neither block nor are blocked, and the slots do not cut a wave.
- The reason of a waiting stage in the queue graph, and its arrows, now list every blocker: all its open dependencies and every earlier stage that shares a file or the schema with it, in the reason (joined by `; `) and in "waits for" on the page, instead of only the first one against the running stage.
