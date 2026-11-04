# Orçamentos estáveis — 2026-11-04 (épico `epic/orcamentos-estaveis`, PR #408, MCP 0.13.0, schema v13)

## Corrigido

- O orçamento de desempenho "pan, zoom e edição com 200 setas" (16 ms, `retry: 1`, ambos iguais) passa a ser medido como os irmãos: 3 rodadas de aquecimento descartadas e a mediana de 15 amostras por métrica, com a métrica no `expect`. O nome diz o que se mede (o projeto grande).
- No `npm test`, os 3 arquivos de orçamento rodam em projetos próprios do Vitest, depois do resto da suíte e um arquivo por vez, sem disputar CPU com ela. `test:perf`, `test:coverage`, os shards do CI e `PERF_BUDGETS=off` não mudam. Nenhum teste foi removido, pulado ou enfraquecido; a app e o MCP não mudam.
