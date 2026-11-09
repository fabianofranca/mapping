# Testes de crescimento estáveis — [Não lançado] (épico `epic/escala-estavel`, PR #0, MCP 0.28.10 sem mudança, schema v18)

## Alterado

- Testes de crescimento (`npm run test:scale` e os casos de crescimento do `npm run test:perf`): medição n/4n intercalada (gc por par, ordem alternada, aquecimento igual nos dois tamanhos) e teto de 6× calibrado pela medição; só os testes mudam, nada muda para quem usa a app ou o MCP.
