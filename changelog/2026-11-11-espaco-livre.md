# Peça nova em espaço livre — 2026-11-11 (épico `epic/espaco-livre`, PR #1565, MCP 0.33.2, schema v18)

## Corrigido

- A Paleta (soltar, **Adicionar na tela**, **Adicionar no canvas**, **Adicionar dentro de X**) e o `create_marking` do MCP sem `rect` não põem mais a peça nova sobre marcações existentes: ela nasce no lugar livre mais perto do ponto pedido, sem cobrir nem coincidir com outras, e não adota marcações sem aviso.
