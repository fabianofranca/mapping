# Arremates do CI — 2026-11-12 (épico `epic/ci-arremates`, PR #1753, MCP sem mudança, schema v19)

## Alterado

- O passo "Tamanho do dist/index.html" do `ci.yml` lê o teto só do `scripts/ci/dist-budget.json`. O plano B que lia a linha `INDEX_HTML_MAX_BYTES` do `ci.yml` do próprio checkout saiu: um ref anterior à etapa #1614 (por exemplo um preview manual de um PR antigo do Dependabot) falha com o `::error` "ref anterior à etapa #1614: traga a main", e a correção é trazer a `main`.
- O `scripts/ci/distBudget.mjs`, que guarda as guardas e os limites do teto, aciona a `/code-review high` no fechamento do épico (`scripts/ci/riskTriggers.mjs` e "Esforço do detalhamento" da skill `detalhar-backlog`). O `scripts/ci/dist-budget.json`, que a subida grava, continua fora dos gatilhos.
- Os comentários do `ci.yml` e do `ci-rerun.yml` dizem o mecanismo real do timeout: o job que estoura o `timeout-minutes` termina `cancelled`, a execução do CI termina `cancelled` (não `failure`) e o `ci-rerun.yml` é pulado pelo `if:`. O `ci-rerun.yml` também registra como a demonstração da etapa #1532 foi montada.
