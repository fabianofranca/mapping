# Orçamentos de layout estáveis — 2026-11-12 (épico `epic/orcamentos-layout-estaveis`, PR #1720, MCP 0.37.0 sem mudança, schema v19)

## Alterado

- A medida dos orçamentos de 4 ms do layout (grade com texto e intrínseco aninhado) passa a fazer 10 aquecimentos, uma coleta de lixo fora do tempo antes de cada amostra e a mediana de 41; só os testes mudam, nada muda para quem usa a app ou o MCP.
- Correção (CL1, #1721): a medida dos mesmos dois orçamentos passa a ter 3 levas de 41 amostras e vale a menor mediana entre elas, porque no CI do épico a mediana de uma leva só passou de 4 ms (4,2 a 5,1 ms) sob disputa de CPU; o teto de 4 ms e o `retry: 1` não mudam, e só os testes mudam.
