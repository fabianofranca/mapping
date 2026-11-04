# Teste primeiro e portão de complexidade — 2026-11-02 (épico `epic/teste-primeiro`, PR #321, MCP 0.12.0, schema v13)

## Adicionado

- Portão de complexidade por função: a regra `complexity` do ESLint (limite 10, erro) vale em `src/**` e `mcp/**` e roda no `npm run lint` do CI. As 319 funções do legado acima do limite estão em `eslint-suppressions.json`, que só pode encolher (`npx eslint --prune-suppressions` quando uma é reduzida). Um teste de tooling prova que a regra pega em `src/` e `mcp/` e não vale em `tests/`, `scripts/`, `viewer/` e `pwa/`.

## Alterado

- Quem desenvolve com agentes: o briefing dos subagentes e a mensagem da sessão da fase passam a exigir **teste primeiro** para mudança de comportamento ou correção (teste visto falhando antes do código; o retorno traz o nome do teste e a falha). Refatoração, documentação e trabalho mecânico só exigem os testes existentes passando antes e depois.
- Nada muda na app nem no servidor MCP.
