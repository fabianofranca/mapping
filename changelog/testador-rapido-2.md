# Testador da nuvem mais rápido, parte 2 — [Não lançado] (épico `epic/testador-rapido-2`, PR #1245, MCP 0.28.11, schema v18)

## Adicionado

- Testador da nuvem: `node scripts/testing/cloud.mjs run [<pasta-do-projeto>] [--prazo=<s>]` executa o corpo do script de passo lido da entrada padrão (heredoc `<<'JS'`), já conectado e com `page`, `browser`, `apoioDir`, `projectDir` e os auxiliares em escopo; imprime o estado no fim e sai com 0 (sucesso), 1 (erro) ou 124 (prazo de 90 s esgotado, ajustável). O "Como agir" do `docs/TESTING-NUVEM.md` manda todo script de passo por ele.
- Testador da nuvem: `node scripts/testing/cloud.mjs help` lista os comandos e a assinatura de cada auxiliar, de uma tabela única conferida por teste.
- Testador da nuvem: o `cloud-up.sh` grava a saída de `npm ci`, `npm run build` e `npm run build:mcp` em `apoio/build.log` e, se algum falhar, mostra as últimas 40 linhas.

## Alterado

- Testador da nuvem: o arquivo de ambiente da rodada passa a se chamar `apoio/env.sh` (o `source env` executava o `/usr/bin/env`); sem compatibilidade com o nome antigo.
