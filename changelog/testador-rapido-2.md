# Testador da nuvem mais rápido, parte 2 — [Não lançado] (épico `epic/testador-rapido-2`, PR #1245, MCP 0.28.11, schema v18)

## Adicionado

- Testador da nuvem: `node scripts/testing/cloud.mjs run [<pasta-do-projeto>] [--prazo=<s>]` executa o corpo do script de passo lido da entrada padrão (heredoc `<<'JS'`), já conectado e com `page`, `browser`, `apoioDir`, `projectDir` e os auxiliares em escopo; imprime o estado no fim e sai com 0 (sucesso), 1 (erro) ou 124 (prazo de 90 s esgotado, ajustável). O "Como agir" do `docs/TESTING-NUVEM.md` manda todo script de passo por ele.
- Testador da nuvem: `node scripts/testing/cloud.mjs help` lista os comandos e a assinatura de cada auxiliar, de uma tabela única conferida por teste.
- Testador da nuvem: o `cloud-up.sh` grava a saída de `npm ci`, `npm run build` e `npm run build:mcp` em `apoio/build.log` e, se algum falhar, mostra as últimas 40 linhas.
- Testador da nuvem: `settle(page)` espera a app assentar (sem "Salvando…", dois quadros e 200 ms sem mutação) no lugar do `waitForTimeout`, hoje proibido nos scripts de passo; o `state()` o chama antes de ler.
- Testador da nuvem: `openWindow(page, id)` e `closeWindow(page, id)` abrem e fecham janelas de ferramenta sem alternar; `drag(page, de, para)` arrasta e avisa perto de uma alça da seleção; `setViewport(page, largura, altura)` ajusta a janela do Chrome ao tamanho interno pedido.
- Testador da nuvem: `cloud.mjs find <texto>` e `find(page, texto)` listam os candidatos de um nome; no `run`, timeout ou modo estrito de localizador é seguido da lista. O apêndice A do guia traz a lista de nomes repetidos (Revisar, Mostrar todas, Conversas, Árvore, compositor, dois diálogos) com o localizador de cada um.
- Testador da nuvem: `node scripts/testing/round-guide.mjs --grupos <roteiros>` conta os passos de cada item (sem o R0) e, acima de 40, propõe até 5 grupos paralelos sem separar roteiro nem cadeia de dependência, com uma linha `grupo k de n: <roteiros>` por grupo (até 40, "uma sessão"). O `docs/TESTING-NUVEM.md` ganha a seção "Rodada dirigida em grupos" (tabela das cadeias, modo "dirigido, grupo k de n", relato e achados `k.n`) e o `docs/FLOW.md` a mensagem por grupo, a conferência de 60 min com os n avisos e o resumo.

## Alterado

- Testador da nuvem: o arquivo de ambiente da rodada passa a se chamar `apoio/env.sh` (o `source env` executava o `/usr/bin/env`); sem compatibilidade com o nome antigo.
- Testador da nuvem: os blocos de preparo dos roteiros que criam a pasta de um projeto ou gravam o `mapping.json` (R3.8e, R22 e R23) não sobrescrevem mais: pasta existente imprime "já existe: o preparo já rodou; não rode de novo" e nada é apagado.
- Testador da nuvem: as mensagens do `docs/FLOW.md` passam a dizer "R0 inteiro primeiro" na dirigida e "R0 só o R0.1 e os passos de que os achados dependem" no reteste, e a mensagem vale quando divergir do guia; toda mensagem de dirigida e de bloco traz a lacuna `Tag da release: <mcp-v…-rc.n, ou "sem R21">`.
- Fluxo de entrega: o reteste de uma etapa é uma sessão só, com os achados de todos os grupos ou blocos e os passos que as correções afetam; correção mesclada antes de o reteste começar entra nele. O `CLAUDE.md` ("Fluxo automatizado") e a skill `implementar-fila` dizem isso e citam a rodada em grupos.
