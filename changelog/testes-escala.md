# Testes de escala — [Não lançado] (épico `epic/testes-escala`, PR #1072, MCP 0.28.4, schema v18)

## Adicionado

- `npm run test:scale` mede a mesma operação do modelo com 1.250 e 5.000 marcações e exige que o tempo cresça menos de 5× (um crescimento quadrático seria ~16×); roda no CI depois dos orçamentos de desempenho. Sem mudança na app nem no MCP.
