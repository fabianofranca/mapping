# Vitest rápido — 2026-11-03 (épico `epic/vitest-rapido`, PR #402, MCP 0.13.0, schema v13)

## Alterado

- Os testes do CI rodam em 4 shards balanceados pelo tempo de cada arquivo (antes, 2 shards divididos por número de arquivos), e os shards não geram mais o relatório de cobertura: só o job `coverage` o gera, ao juntar os blobs. A cobertura continua em todo PR, com o mesmo artifact e o mesmo resumo. Nenhum teste foi removido, pulado ou enfraquecido; a app e o MCP não mudam.
- Os projetos do Vitest deixam de aplicar duas vezes os plugins do `vite.config.ts` (o aviso "applies the same plugin multiple times" some).
- `npm run test:durations` regenera os tempos por arquivo usados na divisão dos shards.
