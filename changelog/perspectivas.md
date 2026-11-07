# Perspectivas — [Não lançado] (épico `epic/perspectivas`, PR #739, MCP 0.26.0, schema v16)

## Alterado

- O `mapping.json` passa à v16: ganha `project.id` (a identidade do projeto, que nunca muda), `perspectives` e `arrivals` (vazias até a primeira perspectiva). Um projeto v15 abre e migra sozinho, e a primeira gravação guarda o backup da v15 em `backups/`.
