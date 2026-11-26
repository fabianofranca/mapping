# Queue MCP version check guard — [Não lançado] (épico `epic/fila-versao-mcp-guarda`, PR #2875, MCP 0.59.3, schema v24)

MCP unchanged.

## Corrigido

- The `implementar-fila` skill no longer raises the MCP version of an epic that does not change the MCP: the version check of the closing (rule 3) and the one before the merge now apply only when the epic's diff touches a release input (`scripts/release/releaseInputs.mjs`), as the closing step already did (#2823).
