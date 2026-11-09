# Testador da nuvem mais rápido, parte 2 — [Não lançado] (épico `epic/testador-rapido-2`, PR #1245, MCP 0.28.11, schema v18)

## Adicionado

- Testador da nuvem: `node scripts/testing/cloud.mjs run [<pasta-do-projeto>] [--prazo=<s>]` executa o corpo do script de passo lido da entrada padrão (heredoc `<<'JS'`), já conectado e com `page`, `browser`, `apoioDir`, `projectDir` e os auxiliares em escopo; imprime o estado no fim e sai com 0 (sucesso), 1 (erro) ou 124 (prazo de 90 s esgotado, ajustável). O "Como agir" do `docs/TESTING-NUVEM.md` manda todo script de passo por ele.
- Testador da nuvem: `node scripts/testing/cloud.mjs help` lista os comandos e a assinatura de cada auxiliar, de uma tabela única conferida por teste.
- Testador da nuvem: o `cloud-up.sh` grava a saída de `npm ci`, `npm run build` e `npm run build:mcp` em `apoio/build.log` e, se algum falhar, mostra as últimas 40 linhas.
- Testador da nuvem: `settle(page)` espera a app assentar (sem "Salvando…", dois quadros e 200 ms sem mutação) no lugar do `waitForTimeout`, hoje proibido nos scripts de passo; o `state()` o chama antes de ler.
- Testador da nuvem: `openWindow(page, id)` e `closeWindow(page, id)` abrem e fecham janelas de ferramenta sem alternar; `drag(page, de, para)` arrasta e avisa perto de uma alça da seleção; `setViewport(page, largura, altura)` ajusta a janela do Chrome ao tamanho interno pedido.
- Testador da nuvem: `cloud.mjs find <texto>` e `find(page, texto)` listam os candidatos de um nome; no `run`, timeout ou modo estrito de localizador é seguido da lista. O apêndice A do guia traz a lista de nomes repetidos (Revisar, Mostrar todas, Conversas, Árvore, compositor, dois diálogos) com o localizador de cada um.

## Alterado

- Testador da nuvem: o arquivo de ambiente da rodada passa a se chamar `apoio/env.sh` (o `source env` executava o `/usr/bin/env`); sem compatibilidade com o nome antigo.
