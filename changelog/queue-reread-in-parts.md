# Queue skill rereads `SKILL.md` in consecutive parts — [Não lançado] (épico `epic/queue-reread-in-parts`, PR #2441, MCP unchanged, schema v22 unchanged)

## Corrigido

- `implementar-fila` ("Session switch" › "New skill on `main`" › Small, and the fallback check in "3. Per stage") says the coordinator rereads the whole `SKILL.md` with `Read` in consecutive parts (`offset` and `limit`, line 1 to the last line, or `allow_large: true` where the tool offers it), because the file is over the `Read` limit and a single `Read` of it is refused. The proof line stays "relido inteiro, <n> linhas", with `<n>` the last line read (#2440).
