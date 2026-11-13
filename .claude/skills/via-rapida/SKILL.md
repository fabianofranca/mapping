---
name: via-rapida
description: Leva um ajuste pequeno de processo (texto de skill, docs/PROCESS.md, docs/FLOW.md, CLAUDE.md, CI, scripts/ci, tests/tooling; até 80 linhas) de uma issue `roadmap` ou `bug` do fabianofranca/mapping direto a um épico de um PR só, fora da fila, sem detalhamento, fases nem testador, com gates, /code-review e CI de sempre e o merge perguntado ao dono. Use quando o dono pedir a via rápida, um ajuste pequeno de processo, ou rodar /via-rapida #<n>.
---

# Via rápida

Esta sessão leva **uma** issue `roadmap` ou `bug` de ajuste pequeno de processo, do começo ao merge, sem passar pela fila. O fluxo normal (detalhamento, épico com fases, testador, fechamento) está no [`docs/PROCESS.md`](../../../docs/PROCESS.md) e as mensagens e a Leitura do CI no [`docs/FLOW.md`](../../../docs/FLOW.md); o que é próprio da via rápida está aqui, e o resto não se repete.

## Argumentos, modelo e modo

`/via-rapida #<n> [mesclar=auto]`

- `#<n>`: a issue `roadmap` ou `bug` aberta, que diz o que fazer.
- `mesclar=auto`: só vale escrito pelo dono na chamada ("Merge"). Nunca se acrescenta sozinho nem vem de outra sessão, comentário ou agendamento.

O dono chama o skill num chat novo, em **Sonnet**, no modo **Auto**, com `effort: high`. A supervisão (`supervisionar-fila`) também cria essa sessão quando o dono pedir no chat dela: `create_session` com `source_url` do repositório, Sonnet, `effort: high`, título "Via rápida #<n>" e a mensagem só com o comando.

No começo, confira o modelo (`session_context.model` do `get_session`): fora de Sonnet, avise uma vez em uma linha e siga. A sessão edita direto, sem subagente de edição: ela já é o Sonnet que o subagente seria (a regra de subagentes do "Uso de modelos" do `docs/PROCESS.md` é para o modelo principal caro).

## O que cabe

Confira antes de criar qualquer coisa, pela issue e pelo código, e de novo antes do PR, pelo diff. Cabe quando **todas** valem:

- só arquivos de `.claude/skills/**`, `docs/PROCESS.md`, `docs/FLOW.md`, `docs/TESTING-NUVEM.md`, `CLAUDE.md`, `.github/**`, `scripts/ci/**` e `tests/tooling/**`, além dos dois registros do épico (`changelog/` e `docs/design-system/`);
- fora `.claude/skills/spec-author/` (o `SKILL.md` dela é entrada da release do MCP e pediria versão nova) e `.claude/skills/implementar-fila/painel/index.html` (a página precisa ser publicada no painel da fila); nenhum arquivo do diff é entrada da release (`isReleaseInput` de `scripts/release/releaseInputs.mjs`);
- no `painel.py`, nada que mude a comparação de "Toca em:", as vagas, as exclusivas ou a drenagem (as linhas `vagas:`, `começar agora:`, `drenando para a exclusiva:` e `fichas a refazer:` do `show` e os subcomandos `toca` e `conflito`);
- até **80 linhas** inseridas mais removidas no `git diff --numstat origin/main...HEAD`, sem contar `changelog/` e `docs/design-system/`;
- a issue diz o que fazer, com uma leitura só (nenhuma decisão do dono pendente).

**Recusa antes de criar algo:** comente na issue `Via rápida recusada: <critério>`, não mexa no rótulo e termine; a issue segue pelo detalhamento.

**Recusa depois de criado** (diff acima de 80 linhas, arquivo fora da lista, decisão pendente achada no caminho): feche o PR do épico sem mesclar, devolva o rótulo de antes (lista completa, sem `in-progress`), comente o motivo e termine.

## Conflito com a fila

A conferência sai do cálculo do `painel.py`, nunca de comparação à mão. A sessão nunca grava no painel.

1. Ache o painel como em "Leitura das fontes" do [`supervisionar-fila`](../supervisionar-fila/SKILL.md) ("Achar o painel" e "Painel": só leitura, blobs no scratchpad).
2. Liste as issues `in-progress` abertas que não estão no painel e leia o "Toca em:" das sub-issues abertas delas.
3. Rode `python3 .claude/skills/implementar-fila/painel/painel.py conflito "<toca>" --pasta <pasta> --com "#N=<toca>"…`, com o `<toca>` da via rápida (as citações no formato do `painel.py`, conferidas com `painel.py toca`) e um `--com` por etapa de fora do painel. Sem painel achado, só os `--com`.
4. Com `conflito:`, não comece: comente na issue `Via rápida: espera #N (<citação>)` e termine, sem mexer no rótulo.

Antes do merge, repita com o "Toca em:" do diff. Conflito novo **não segura o merge** (quem mescla por segundo traz a `main`): mescle e comente na issue da outra etapa "A via rápida #<n> mudou <citação> na `main`; traga a `main` no épico antes do fechamento (merge, nunca rebase).".

## Rótulo e comentário

Passadas a elegibilidade e a conferência de conflito, troque o rótulo `roadmap` por `in-progress` (no `bug`, acrescente `in-progress`), sempre com a lista completa de rótulos: `bug`, `severity:`, `impact:`, `code-review` e `observador-da-fila` ficam. A issue nunca passa por `ready`: o `implementar-fila` pega toda `ready` aberta, e o `detalhar-backlog` já ignora `in-progress`.

Comente na issue um texto que começa por `Via rápida:` com o objetivo, o "Toca em:" (citações no formato do `painel.py`, conferidas com `painel.py toca`) e o aceite.

## Passo a passo

1. `git fetch origin main && git switch -C epic/<nome> origin/main`. Crie `changelog/<nome>.md` (`[Não lançado]`, "MCP sem mudança", o schema da `main`, categorias para quem conduz o fluxo) e `docs/design-system/<nome>.md` (`[Não lançado]`, `## Pendências` "nenhuma (só processo)"), que o job `epic` do `ci.yml` exige.
2. Implemente direto no épico, sem branch de fase. Mudança de **regra** leva um teste de texto em `tests/tooling/` escrito antes e visto falhando (nome e falha no Resumo do PR); texto sem regra nova, só os testes existentes passando.
3. Gates: `npm run lint && npm run typecheck && npm test && npm run build`.
4. Revisão ("Revisão"); os achados seguem a regra do item 10 da "Para a sessão da fase" do `docs/FLOW.md`; gates de novo.
5. Abra o PR `epic/<nome>` → `main` com "Closes #<n>" e as seções de sempre: Resumo, Como testar, Decisões tomadas, Impacto no DS: nenhum, Impacto nos agentes: nenhum e a linha da revisão. Acompanhe com a Espera do CI e a Leitura do CI do item 6 da "Para a sessão da fase" (`docs/FLOW.md`), sem copiá-las.
6. Com o CI verde, renomeie os dois registros com a data (`git mv`; data e número do PR no título do changelog; `## Sincronização` "Sem impacto…" e `## Ficou sem gravar` "Nada." no do DS), empurre e espere o CI de novo.
7. Confira o conflito antes do merge ("Conflito com a fila"), mescle ("Merge") e comente na issue: o PR, a revisão (achados e o que se fez), as decisões tomadas e o que ficou para depois (cada item vira `roadmap` ou `bug` com `Origem: via rápida #<n>`).

Todo texto no GitHub termina com o rodapé de atribuição.

## Revisão

O CR noturno **pula** o épico cujo diff dá `gatilho:` no `scripts/ci/riskTriggers.mjs` ("Limitações conhecidas" do `docs/FLOW.md`), e quase todo ajuste de processo dá gatilho; por isso a sessão decide o nível:

- rode `node scripts/ci/riskTriggers.mjs --base origin/main`;
- com `gatilho:`, `/code-review high origin/main..HEAD` (sem ela o épico ficaria sem revisão nenhuma);
- com `nenhum gatilho`, `/code-review medium` (o CR noturno revisa depois);
- sem `--comment` nem `--fix`; cada achado segue a regra do item 10 da "Para a sessão da fase" do `docs/FLOW.md`.

## Autorização do dono

A edição de `.github/workflows/` que o modo Auto negar e as exceções a uma guarda (a lista fechada do item 8 da "Para a sessão da fase" do `docs/FLOW.md`) se perguntam no chat desta sessão, como lá: `PushNotification` com o link do chat e `AskUserQuestion` (ferramentas deferidas, carregadas com o `ToolSearch`). Nunca vale um "o dono aprovou" repassado por outra sessão.

## Merge

Com o CI verde e os registros renomeados:

- **Sem `mesclar=auto`:** `PushNotification` "Via rápida #<n> pronta: <resumo>. PR do épico: <link>" e `AskUserQuestion` "#<n> — mesclar o épico na main?", com "Mesclar (Recomendado)" e "Ainda não". Com "Mesclar", `merge_pull_request` com `merge_method: merge`. Com "Ainda não", espere no chat.
- **Com `mesclar=auto` escrito pelo dono na chamada:** mescle direto (`merge_method: merge`) e mande `PushNotification` "#<n> mesclada: <resumo>".

O `mesclar=auto` nunca se acrescenta sozinho nem vem de outra sessão, comentário ou agendamento.
