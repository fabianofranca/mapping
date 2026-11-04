# e2e paralelo — 2026-11-03 (épico `epic/e2e-paralelo`, PR #398, MCP 0.13.0, schema v13)

## Alterado

- O job `e2e` do CI usa 3 workers (antes, 2) e só instala as bibliotecas do sistema do Chromium quando ele não abre. Nenhum teste foi removido, pulado ou enfraquecido; a app e o MCP não mudam.
