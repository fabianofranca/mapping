---
name: implementar-fila
description: Coordena a implementação em sequência das issues `ready` do fabianofranca/mapping, no fluxo automatizado do docs/PROCESS.md. Monta a fila (pela linha "Depende de", severidade e impacto), mostra a ordem ao dono e então, issue por issue, cria o épico, as sessões das fases e do testador, roda correções até zerar os ❌, faz o fechamento e pede ao dono o merge de cada épico na `main`. Mantém o painel "Fila de desenvolvimento" atualizado, gasta pouco contexto (leituras pesadas por subagente, uma conferência por hora) e passa a coordenação para uma sessão nova quando o contexto enche. Use quando o dono pedir para implementar as `ready`, rodar a fila, "a fábrica", "implemente tudo que está ready", ou rodar /implementar-fila.
---

# Implementar a fila

Esta sessão é o **coordenador** de uma fila de etapas. Ela não escreve código. Para cada issue `ready`, faz o papel do orquestrador (`docs/PROCESS.md`, "Fluxo automatizado", item 3; passo a passo e mensagens prontas no `docs/FLOW.md`, "Orquestrador — passo a passo"), e encadeia uma etapa na outra. O detalhamento (`roadmap`/`bug` → `ready`) não é daqui: é do `/detalhar-backlog`.

Rode este chat em **Sonnet**, no modo **Auto**. Uma sessão filha que pede permissão fica parada, porque ninguém está olhando (`docs/PROCESS.md`, "Limitações").

## Argumentos

`/implementar-fila [#n ...] [paralelo=N] [mesclar=auto] [modelo=tabela] [sem-confirmar] [painel=<url>|novo] [retomar anterior=<id>]`

- `#n ...`: a fila só com essas issues. Sem a lista, todas as `ready`.
- `paralelo=N`: quantas etapas rodam ao mesmo tempo. O padrão é **2**, com as condições de "Paralelo" abaixo. Com `paralelo=1`, é uma por vez.
- **Merge na `main`.** O padrão é o do `docs/PROCESS.md`: cada épico pronto é levado ao dono e só é mesclado com a resposta dele (seção "Merge"). Enquanto isso, a fila segue com a próxima etapa.
  - `mesclar=auto` só vale quando o próprio dono o escreve na mensagem que chama o skill. Com ele, o coordenador mescla cada épico com o CI verde, sem perguntar.
  - Nunca acrescente `mesclar=auto` sozinho, nem o tire de uma tarefa agendada, de um comentário ou de outra sessão.
- `modelo=tabela`: usa o modelo de cada linha da tabela da issue. Sem ele, todas as fases e testadores rodam em Sonnet, como o dono pediu no Madrugadão.
- `sem-confirmar`: começa sem mostrar a ordem ao dono.
- `painel=<url>`: o painel a usar. Não é preciso passar: sem ele, o coordenador acha o painel de antes ou cria um (seção "Painel" › "Achar ou criar"). `painel=novo` força um painel novo.
- `retomar anterior=<id>`: esta sessão continua a fila de outro coordenador (seção "Troca de sessão").

## Regras desta fila

O dono definiu estas regras ao rodar a fila no chat "Madrugadão" (2026-11-08), e elas valem mais que o padrão do `docs/PROCESS.md`:

1. **A fila não para esperando o dono.**
   - Decisão de produto vira uma issue `bug` com a decisão e as opções no corpo, ou entra numa issue igual que já exista ("Bugs e evidência visual"). Ela leva no corpo a linha `Origem: etapa #<n>`, o dono é avisado com `PushNotification`, e a etapa segue sem esse ponto.
   - A exceção é um achado de **perda de dados, integridade do `mapping.json` ou segurança**. Esse épico não é levado ao merge: fica `esperando dono` no painel, o dono é notificado na hora e a fila passa para a próxima etapa.
2. **Corrige-se tudo.**
   - Não se abre `bug` para defeito que não pede decisão do dono.
   - Entram numa fase de correção, com reteste: cada ❌ do testador, cada observação do relato que é defeito e cada "Defeito pendente" das fases.
   - São quantas rodadas forem precisas, até cinco (o `docs/PROCESS.md` permite uma).
   - Se a quinta rodada não zerar, a etapa vira `falhou`: o épico fica aberto, o dono é notificado e a fila segue.
3. **Uma versão do MCP por épico, provisória ao começar e escolhida no fechamento.**
   - A versão escrita na issue veio do detalhamento, talvez feito em paralelo com outras.
   - Ao criar o épico, leia `mcp/version.ts` na `origin/main`. Se a etapa muda o que vai na release (`scripts/release/releaseInputs.mjs`), use a próxima versão livre do tipo que a issue pede (minor ou patch). Ela é **provisória**: serve aos snapshots, à rc da última fase (`mcp-v<versão>-rc.<n>`) e ao título do changelog.
   - No fechamento, antes do push, o coordenador faz `git fetch origin main`. Se o `SERVER_VERSION` da `origin/main` já é maior ou igual à versão do épico, traz a `main` (`git merge origin/main`, nunca rebase) e sobe a versão para a próxima livre do mesmo tipo sobre a da `origin/main`. Muda junto `mcp/version.ts`, cada citação em `docs/MCP.md` (e no `docs/AGENT-GUIDE.md`, se houver) e a primeira linha do `changelog/<nome>.md`, e roda `npx vitest run tests/mcp/version.test.ts` além do `npx vitest run tests/tooling`.
   - Número trocado: um comentário na issue da etapa diz o antigo e o novo (no subagente do fechamento, passo 5 de "Por etapa").
   - Versão sem troca no fechamento: a rc gerada com a provisória vale, e o `mcp-release.yml` apaga as rc da versão que publica.
   - Versão trocada no fechamento: o `mcp-release.yml` só apaga rc do número que publica, então a rc do número antigo (`mcp-v<antiga>-rc.<n>`) fica solta e o número novo não tem rc. Rode o workflow MCP pre-release no `epic/<nome>` depois da troca (`actions_run_trigger`) e cite a rc do número antigo no comentário da troca, para o dono apagá-la.
   - **Versão do schema** (mesma ideia): ao criar o épico de uma etapa que sobe o schema, leia a versão do schema na `origin/main` e use a próxima. Se o número escrito na issue for outro, comente na issue e passe o número certo na mensagem da primeira fase.
   - Se dois épicos fecham perto, o segundo traz a `main` e sobe a versão: por isso a conferência antes do merge (seção "Merge") também lê o `SERVER_VERSION` da `origin/main`.

## Economia de contexto

Um resultado grande de ferramenta não some do contexto: fica nele até o fim da sessão e é relido em cada turno seguinte. Um coordenador de 2026-11-09 chegou a ~417k tokens em 82 min, e o sucessor a 258k em 5 min (etapa #1285), quase tudo por leituras que o coordenador não precisava ter feito ele mesmo. Por isso:

1. **O coordenador não lê corpo de issue.** Nem `issue_read` `get` de etapa, nem `get_sub_issues`, nem `get_comments`. Quem lê é um subagente (ferramenta `Agent`, `model: "haiku"`), que devolve a **ficha** da etapa (modelo em "Ficha da etapa"). A ficha vai para o campo `plan` da linha da fila e é a fonte de tudo o que o coordenador precisa da issue até o fim, nesta sessão e nas seguintes.
2. **Leitura e escrita pesadas no GitHub vão por subagente**, que devolve uma linha por tarefa: o estado do PR antes do merge, a conferência da Release do MCP e a criação da sub-issue de correção, com a leitura do relato do testador. O `sub_issue_write` e o `issue_write` com `parent_issue_number` devolvem a issue-pai inteira (~40k caracteres); `actions_list` devolve ~30k por chamada; `get_release_by_tag`, ~20k.
3. **Nunca `list_triggers`, `list_sessions` com limite alto, nem `list_events` sem `kinds` e `limit` pequenos.** Os ids que importam (filhas, conferência) ficam no painel.
4. **Uma conferência de reserva por sessão**, não uma por filha (seção "Conferências de reserva").
5. **Mensagens curtas para as filhas**: os valores e o nome da mensagem do `docs/FLOW.md`, não o texto inteiro copiado (passo 2 de "Por etapa").
6. **O JSON do painel nunca vai inteiro para o chat.** O `painel.py` imprime só `alterados: …`; para ver o estado, `show` (resumo) ou `show '#n'` (uma linha, com a ficha). Nada de `cat` dos arquivos.
7. **O painel é o canal com o dono, publicado a cada avanço, uma vez por ciclo.** Cada aviso que chega é um ciclo: faça todos os passos dele, grave tudo no `painel.py` (cada avanço tem a sua linha no `log` e o `current` atualizado) e publique o painel **uma vez**, no fim, só com os arquivos alterados. Nunca há duas publicações no mesmo ciclo. A conferência de hora em hora sem atrasadas não publica.
8. **Uma leitura por coisa.** O que já está no contexto (o aviso da filha, a ficha, o número do PR) não se lê de novo para conferir.
9. **Mensagens do `docs/FLOW.md` pelo nome da seção, nunca por `grep`.** As que a fila usa são, pelo título exato: "Para a sessão da fase", "Fase de correção", "Para o testador", "Rodada dirigida em grupos", "Reteste junto" e "Rodada completa em 5 blocos". Leia uma por um comando só, que imprime a seção inteira e nada mais: `awk '/^## <título>$/{f=1;print;next} /^## /{f=0} f' docs/FLOW.md`. Uma mensagem já lida nesta sessão não se lê de novo.
10. **O chat fica quase mudo.** Depois de um ciclo, o coordenador não escreve resumo: no máximo uma linha curta, só quando o dono precisa saber agora. O resto vai para o `log` e o `current` do painel. O chat é para três coisas: as perguntas ao dono (seletor de perguntas), as notificações do skill (`PushNotification`) e a tabela do "Fim". Se o dono perguntar algo, a resposta vai no chat, curta.
11. **Um subagente por ciclo.** As tarefas de GitHub de um mesmo ciclo (ficha de uma `ready` nova, estado do PR antes do merge, conferência da Release, arquivar uma filha) vão num subagente só, com um briefing que lista todas e pede uma linha por tarefa. Subagentes separados só quando um depende do resultado do outro.
12. **Rótulo sem perder os outros.** O `issue_write` com `labels` substitui todos os rótulos da issue. Onde o skill manda trocar um rótulo (`ready` por `in-progress`, por exemplo), leia os rótulos atuais e envie a lista completa: os de antes, sem o que sai e com o que entra. Depois, confira no mesmo subagente do ciclo que `bug`, `severity:`, `impact:` e `code-review` continuam.

### Ficha da etapa

Briefing do subagente (um só para todas as issues candidatas, com `model: "haiku"`):

```text
Leia no GitHub (fabianofranca/mapping), só lendo, as issues <#a #b ...>: o corpo, as sub-issues (get_sub_issues) e o corpo de cada sub-issue. Não escreva nada. Para cada issue, devolva UMA linha, sem mais nada:
#<n> | <título curto> | dep=<números do **Depende de:**, ou "nenhuma"> | nivel=<severity: x ou impact: x> | mcp=<não, ou minor/patch e a versão pedida> | schema=<não, ou vN> | epico=<epic/nome> | fases=<código:#sub-issue:esforço do coordenador, separados por vírgula, na ordem> | toca=<arquivos e pastas do "Toca em:" de todas as fases, separados por vírgula> | testador=<roteiros da seção Testador da última fase; "completa" se pede a rodada completa> ; visual=<lista ou "nenhuma"> ; <modelo e esforço do testador>
Se um campo não existir na issue, escreva "?" nele.
```

Grave cada linha com `row '#n' plan="<a linha>"` (e `title`, `phases` com as fases em `open`).

## 1. Começo

1. `get_session` sem `session_id`: guarde o **id** desta sessão (o "Coordenador" das mensagens) e o `session_context.model`. Se não for Sonnet, avise uma vez que a coordenação custa mais e siga. `set_session_title`: "Fila — coordenador".
2. Outro coordenador rodando? `list_sessions` (`mine: true`, `limit: 10`; pule com `retomar`). Uma sessão "Fila — coordenador" que esteja trabalhando e não seja esta nem a `anterior` é outra fila: pare e diga ao dono.
3. Carregue com o `ToolSearch` o que vai usar:
   - `AskUserQuestion`, `PushNotification` e `ArtifactData`;
   - as `mcp__github__*`: `list_issues`, `issue_write` (só para trocar rótulos e criar issues sem pai), `add_issue_comment`, `create_pull_request`, `update_pull_request` e `merge_pull_request`. Leituras de issue, PR, Actions e Release ficam com os subagentes ("Economia de contexto");
   - as `mcp__claude-code-remote__*`: `create_session`, `send_message`, `create_trigger`, `delete_trigger`, `get_session`, `list_environments` e `list_events`.
4. Sem `retomar`, crie a conferência de reserva da sessão (seção "Conferências de reserva") e grave o id no painel assim que ele existir (passo 5 de "Fila"): `painel.py reserve <pasta> <trig_id>`.
5. Com `retomar`, siga "Troca de sessão" › "Na sessão nova" e volte ao passo 4 de "Fila".

## 2. Fila

1. `list_issues` (`state: OPEN`, `labels: [ready]`, `fields: [number, title, labels]`, `perPage: 50`). Tire as que têm `step`. Com a lista `#n ...`, use a interseção e diga o que ficou de fora e por quê.
2. As `in-progress` abertas não entram: estão com outro orquestrador. Mostre-as à parte, como "em andamento noutro chat".
3. Peça a ficha das candidatas a **um** subagente ("Ficha da etapa"), nunca com `issue_read` no coordenador. A ficha traz o `**Depende de:**`, a severidade ou o impacto, as fases com a sub-issue e o esforço de cada uma, o "Toca em:" de todas as fases, se muda o MCP ou o schema, e a seção **Testador** da última fase. Grave-a no painel (`plan`) antes de seguir.
4. **Ordem:**
   1. Dependências primeiro: uma etapa só começa quando cada "Depende de" já foi mesclado na `main`. Uma dependência fora da fila e ainda aberta deixa a etapa `aguardando`, com o motivo no passo.
   2. Depois, as mudanças do próprio fluxo de entrega (`.github/`, `CLAUDE.md`, `docs/PROCESS.md`, `docs/FLOW.md`, `.claude/`), que valem para as etapas seguintes.
   3. Depois, `severity: high`/`impact: high`, depois `medium`, depois `low`.
   4. No empate, as que mexem nos mesmos arquivos ficam juntas e em sequência (menos merge da `main` no épico).
   5. Por fim, o menor número vem antes.
5. Painel: crie ou abra (seção "Painel") e grave a fila, com `status: aguardando` e as fases `open`.
6. Sem `sem-confirmar`:
   - mostre no chat uma tabela com a ordem, a issue, o título, as fases, o "Depende de", o porquê da posição e o que roda em paralelo;
   - mande `PushNotification` "Fila pronta: N etapas";
   - pergunte pelo `AskUserQuestion`: "Começar nesta ordem (Recomendado)" / "Mudar a ordem". A resposta em "Outro" vale como foi escrita.
7. `painel.py start`, log "Execução iniciada", e comece.

## 3. Por etapa

Siga o `docs/FLOW.md` ("Orquestrador — passo a passo" e as mensagens), com o que esta seção acrescenta. Atualize o painel em cada passo marcado com ▸ (seção "Painel").

1. **Épico.**
   - Troque `ready` por `in-progress` na issue, com a lista completa de rótulos (item 12 de "Economia de contexto").
   - `git fetch origin main && git switch -C epic/<nome> origin/main`. Use sempre a `origin/main`, porque a `main` local pode ter divergido.
   - Use a versão provisória do MCP (regra 3); ela só é escolhida de verdade no fechamento.
   - Faça o push do épico.
   - Abra o PR do épico para a `main` assim que houver diferença, com `PR #0` no título do changelog. **Nunca preveja o número de um PR**: depois de abrir, troque `#0` pelo número real.
   - ▸ `status: em andamento`, `stage: Fases`, `started: now`.
2. **Fases**, na ordem, cada uma numa sessão filha (`create_session`):
   - `model`: Sonnet, ou o da tabela com `modelo=tabela`;
   - `source_url` `https://github.com/fabianofranca/mapping`, `source_revision` `epic/<nome>`;
   - título "<código> — <título> (#<sub-issue>)";
   - nunca `permission_mode: plan`.

   A mensagem é **curta** (não copie o texto da "Para a sessão da fase" do `docs/FLOW.md`; a filha o lê):

   ```text
   Fase <código> — <título> da etapa #<etapa> (sub-issue #<fase>), do repositório `fabianofranca/mapping`, no fluxo automatizado. Épico `epic/<nome>`, branch curto `<branch>`. Siga a mensagem "Para a sessão da fase" do `docs/FLOW.md` (itens 1 a 9) com estes valores; subagentes e esforço: os da sub-issue. Item 10 (revisão `/code-review`): <nível, ou "não se aplica">. Rótulo `mcp-rc`: <sim, ou "não">.
   <linhas da fila, abaixo>
   Coordenador: `<id>`
   ```

   As linhas da fila, antes de "Coordenador":
   - sem `modelo=tabela`: "O dono decidiu rodar esta fase em Sonnet, mesmo que a tabela defina outro modelo: não recuse nem pare por modelo.";
   - "Não edite a seção **Testador** da sub-issue: ela é do coordenador.";
   - quando a coluna Esforço da linha da fase na tabela é `high`, `xhigh` ou `max`, o item condicional da revisão `/code-review` de "Para a sessão da fase" do `docs/FLOW.md`, com o nível da tabela e `<base>` = `git merge-base origin/epic/<nome> HEAD`. Vale também sem `modelo=tabela`, porque o esforço sai da tabela de qualquer forma. A fase de correção não tem linha na tabela e segue sem o item;
   - só na última fase, e só se o épico muda o MCP: "ponha o rótulo `mcp-rc` no PR". Sem mudança no MCP não há rótulo; com ele, sairia uma rc espúria.

   Guarde a filha: `row '#n' child=<id> childAt=now` e registre a sessão: `painel.py session <pasta> '#n' <id>`. ▸ fase aberta.

   Quando a fase avisar: ▸ fase `ok`, o PR no passo e `child=` (vazio), e guarde os "Defeitos pendentes" no `log`. Com o PR mesclado no épico e a sub-issue fechada, **arquive a filha** (`archive_session`; item "Arquivar as sessões" abaixo).

3. **Testador.**
   - `list_environments`: use o "Mapping - testes".
   - A mensagem é a do `docs/FLOW.md`, com os roteiros e a passada visual da seção **Testador**. A rodada completa vai em 5 blocos; a dirigida com mais de 40 passos sem o R0 vai em grupos (`node scripts/testing/round-guide.mjs --grupos <roteiros>` no clone do épico, uma sessão por grupo, até 5; `docs/FLOW.md`, "Rodada dirigida em grupos").
   - Guarde as filhas: `row '#n' child="<id1> <id2> …" childAt=now` e registre cada uma com `painel.py session`. ▸ `stage: Testador`.
   - Quando um testador avisar: tire o id dele de `child`. Com o relato postado e lido o total, **arquive a filha**. Com todos os avisos: ▸ log com o total de ✅/❌, os links dos relatos e o tempo. Não leia os relatos: o aviso traz o total e o link, e quem lê os achados é o subagente da correção.
4. **Correção** (regra 2), enquanto houver ❌, observação que é defeito ou defeito pendente:
   - peça a um subagente (`model: "sonnet"`) que crie a sub-issue `step` de correção: o briefing traz a etapa (pai), o código próprio (por exemplo `CL3`, `CL4`…), os links dos relatos, os defeitos pendentes com a origem e o aceite do `docs/FLOW.md` ("Fase de correção"); ele lê os relatos, lista os ❌ e as observações que são defeito, cria a sub-issue com `issue_write` e `parent_issue_number` e devolve **só** "#<número>: <N> achados (<códigos>)";
   - crie a sessão filha com a mensagem da fase e, depois dela, o reteste dirigido (`docs/FLOW.md`), **numa sessão só** com os achados de todos os grupos ou blocos e os passos que as correções afetam; correção mesclada antes de o reteste começar entra nele ("Reteste junto");
   - registre cada sessão criada (`painel.py session`) e arquive a da correção, como a da fase, ao ser mesclada;
   - ▸ `stage: Correção` e uma fase nova em `phases`.

   O que pede decisão do dono segue a regra 1.

   **Achado que depende de código de outro épico** (de uma etapa `ready`, `in-progress` ou parada, ainda fora da `main`) não segura o épico:
   - o briefing do subagente da correção manda separar esses achados, cada um com o número da etapa (#N). Uma sessão de fase ou de correção que descobre isso no caminho o põe nos "Defeitos pendentes" do aviso, com "depende de #N", e não espera;
   - no mesmo subagente (ou no do ciclo seguinte), um `bug` já `ready` por achado ou por grupo de achados com o mesmo #N. O épico atual segue sem esse ponto; a sub-issue de correção não o leva, e sem outro achado não há correção;
   - formato do `bug`: rótulos `bug`, `ready` e `severity: <nível>` (o do achado; vários, o maior); título "Etapa: <defeito curto> (correção que depende de #N)"; corpo do `bug` (o que acontece, o esperado, passos, branch e commit, origem com o link do relato, a severidade e o porquê, "Duplicadas: …"), mais o objetivo, o épico `epic/<nome>`, a versão (`MCP: patch` se a correção muda o que vai na release, senão `MCP: sem mudança`; schema sem mudança), a tabela de modelos (Orquestrador Sonnet; correção em Sonnet medium; Testador Sonnet medium, ou "nenhum" sem passo de roteiro afetado), a linha `Origem: etapa #<n>` e a linha `**Depende de:** #N`;
   - uma sub-issue `step` de correção no formato da "Fase de correção" do `docs/FLOW.md`, com o "Toca em:" provável e a seção **Testador** com os roteiros e passos que falharam e "Passada visual: nenhuma";
   - painel: o `bug` entra como linha `kind=bug`, `status: aguardando`, com a ficha (`plan`) que o subagente devolve. Entra mesmo com a fila chamada com a lista `#n ...` (seção "Mudanças na fila durante a execução");
   - como a fila relê as `ready` entre etapas, o `bug` começa sozinho quando o #N for mesclado, pela "Ordem" de sempre;
   - **exceção:** achado de `severity: high` (perda de dados, integridade do `mapping.json`, segurança) segue a regra 1: o épico fica `esperando dono`.

5. **Fechamento** (o que corre durante o CI):
   - antes do push, rode `npx vitest run tests/tooling`: o registro do DS com data precisa das seções `## Sincronização` e `## Ficou sem gravar`;
   - **escolha a versão do MCP** (regra 3): se `git diff --name-only origin/main...HEAD` toca algum arquivo de `scripts/release/releaseInputs.mjs`, confira o `SERVER_VERSION` da `origin/main` e, se alcançou o do épico, traga a `main` e suba a versão antes do push; a versão em `mcp/version.ts` precisa ser nova;
   - o coordenador faz o que vai no commit ou no PR, antes do push:
     - changelog e registro do DS renomeados com a data (`git mv`);
     - pendências aplicadas no artefato do DS;
     - descrição final do PR do épico, com "Closes #<etapa>" (editar o corpo do PR não roda o CI);
   - no mesmo ciclo do push, **um** subagente (item 11 de "Economia de contexto") cria as issues do que ficou para depois e posta o comentário de fechamento na issue (e o da versão trocada, se houver), e devolve uma linha com os números das issues e o id do comentário. Isso corre **durante o CI** do épico; o merge não espera o retorno dele, e se ele falhar o coordenador o refaz no ciclo seguinte;
   - cada item que ficou para depois vira uma `roadmap` (com o impacto), ou um `bug` se pedir decisão. **Toda issue que a fila cria** (esses `bug` e `roadmap`, o `bug` de decisão do dono e o `bug` `ready` da correção dependente) leva no corpo a linha `Origem: etapa #<n>`; o painel só aponta para a busca dessa linha no GitHub, sem tabela de issues;
   - **rede de segurança (decisão 11 da #1324):** se o diff do épico (`git diff --name-only origin/main...HEAD`) toca algum gatilho de risco de "Esforço do detalhamento" do skill `detalhar-backlog` (os skills `implementar-fila` e `detalhar-backlog`, o `painel.py`, regra do `docs/FLOW.md` ou do `docs/PROCESS.md`, `.github/workflows/`, `scripts/release/`, `mcp/version.ts`, `formatVersion`, `src/store/session.ts`, `pwa/csp.ts`), rode a `/code-review high` no diff inteiro do épico (base `main`) antes do merge, por subagente (item 11 de "Economia de contexto"), mesmo que as fases tenham sido medium. Os defeitos confirmados são corrigidos no próprio épico, com teste primeiro, e os gates rodam de novo;
   - ▸ `stage: Fechamento`. A sessão do fechamento, se houver, é registrada e arquivada como a da fase.
6. **Merge** (seção "Merge"). Depois do merge:
   - confira o "MCP release" por um subagente (`model: "haiku"`), com o briefing "Confira, só lendo, a execução do workflow MCP release do commit `<sha do merge>` em fabianofranca/mapping (`actions_list` com `perPage: 1`) e, se a versão `<v>` é nova, a release `mcp-v<v>` (não é pre-release; tem `mapping-mcp.js`, `setup.sh`, `SKILL.md`, `AGENTS.mapping.md` e `watch-comments.mjs`, cada um com o `.sha256`; as rc da versão sumiram); sem versão nova, que o job `release` foi pulado. Devolva uma linha: ok, ainda rodando, ou falhou com o motivo e o link." Esse subagente é o do ciclo do merge (item 11 de "Economia de contexto") e faz a **primeira conferência no mesmo ciclo do merge**: lê os jobs `decide` e `release`. Com o job `release` pulado (sem versão nova, 8–15 s), a Release está conferida e acabou ali. Com `release` rodando (versão nova, 265–391 s, mediana ~330 s), a próxima conferência é um `send_later` de **5 min depois do merge** e as seguintes, **a cada 1 min**. Ignore a execução `skipped` e, com `cancelled`, vale a mais nova do commit da cabeça. Passou de 3 min (pulado) ou de 9 min (versão nova) sem terminar, o workflow está travado: leia a execução, rode de novo uma vez se morreu antes de testar e chame o dono se falhar de novo. A conferência pendente não segura o merge do próximo épico (seção "Merge");
   - **arquive o que sobrou** da etapa: cada id ainda aberto em `sessions` da linha dela (`archive_session`), numa só passagem do subagente do ciclo; log "#<n> sessões arquivadas";
   - o resultado da conferência da Release do MCP é acrescentado ao comentário de fechamento (editado pelo id) pelo subagente do ciclo do merge; sem o id do comentário de fechamento (o subagente do fechamento ainda não devolveu, ou falhou), o resultado vai num comentário novo na issue, nunca em outro comentário;
   - **painel publicado:** depois do merge do épico, quem fecha a etapa troca o `files/index.html` do painel pela página nova desta pasta e apaga o `datasets/issues` (`ArtifactData` com `if_version`), se ainda existir. A página não quebra se o dataset `issues` existir num painel antigo;
   - ▸ `status: concluída`, `stage: Mesclada`, `ended: now`.
7. **Entre etapas:**
   - liste as `ready` de novo e refaça a ordem das que aguardam (seção "Mudanças na fila durante a execução");
   - confira o contexto e se o skill mudou na `main` ("Troca de sessão"), com `git fetch -q origin main && git diff --quiet HEAD origin/main -- .claude/skills/implementar-fila/SKILL.md`;
   - comece a próxima etapa livre.

**Arquivar as sessões** (`archive_session`, para a lista de sessões do dono ficar legível):

- **Quando:** logo depois de processar o aviso final de uma filha, sem esperar a etapa inteira, no mesmo ciclo e, de preferência, no subagente do ciclo. Fase, correção e fechamento: PR mesclado no épico com a sub-issue fechada. Testador, grupo ou bloco: relato postado e total lido. Grave no `log` "<código> arquivada".
- **O que não se arquiva:** uma filha que avisou que parou, falhou ou pediu decisão; as filhas de uma etapa `falhou` ou `esperando dono`; uma filha que ainda está rodando. O dono pode precisar delas; elas são arquivadas quando a etapa é entregue.
- **Registro:** cada sessão criada para a etapa vai para o campo `sessions` da linha dela (`painel.py session <pasta> '#n' <id>`, sem repetir). Depois do merge do épico, arquive o que ainda estiver aberto ali.
- O coordenador não arquiva a si mesmo.

**Conferências de reserva:**

- **Uma por sessão do coordenador**, não uma por filha: `create_trigger` sem `persistent_session_id` (dispara nesta sessão), `cron_expression: "0 * * * *"` (de hora em hora), `initiation: own_followup`, com o id guardado por `painel.py reserve`. Ela vale para todas as filhas e é apagada só na troca de sessão e no fim. Nada de `send_later` por filha, nada de `delete_trigger` a cada aviso, nunca `list_triggers`.
- A mensagem guardada se sustenta sozinha: "Conferência da fila: rode `painel.py show` e confira as atrasadas; painel <url>; siga o skill implementar-fila".
- Na conferência, confira primeiro se o skill mudou na `main` ("Troca de sessão"); se mudou, dê o `git pull` e aplique a regra de "Troca de sessão" › "Skill novo na `main`" (grande: troca de sessão; pequena: releitura do `SKILL.md` inteiro com prova no `log`). Depois, `show` lista as **atrasadas** (filha sem aviso há mais de 30 min). Sem atrasadas (e sem conferência de Release pendente), não faça mais nada nesse ciclo: nem publicar o painel.
- Para cada atrasada, leia `get_session` (`status_bucket`) e, só se não estiver trabalhando, `list_events` com `kinds: ["assistant", "result"]` e `limit: 10`:
  - trabalhando: `row '#n' childAt=now` (volta a contar);
  - `review_ready` ou `idle` (o último turno terminou sem o aviso): primeiro mande `send_message` a ela, "Conferência da fila: a fase não avisou. Retome do ponto em que parou (CI do PR, merge, aviso) e avise o coordenador.", e `row '#n' childAt=now`. A sessão guarda o contexto e retoma mais barato que uma nova;
  - falhou, parou pedindo permissão ou morreu, ou ainda atrasada e parada na conferência seguinte ao `send_message`: crie a sessão de novo uma vez, com a mesma mensagem e mais "a sessão anterior (<id>) parou em: <o que os eventos mostram>";
  - se acontecer de novo, a etapa vira `falhou`, o dono é notificado e a fila segue.

**CI vermelho no PR do épico** (o job `epic`, a trava da versão ou o tamanho do `dist`, por exemplo): corrija no próprio épico. Se for registro (changelog, DS, versão), basta um commit do coordenador. Se for código, abra uma fase de correção.

- **O coordenador não roda o CI de novo.** A reexecução é do `ci-rerun.yml` (a automática, só na tentativa 1) e, na fase, a segunda (docs/FLOW.md, "Para a sessão da fase"). No PR do épico com runner abandonado que persiste, ou ao receber o aviso "CI travado" de uma fase, chame o dono (regra 1: etapa `esperando dono`, `PushNotification` com o link da execução). A espera pela Release do MCP não muda.
- **Teto do `dist/index.html` (sobe sozinho, sem esperar o dono).** Vale quando: (1) o tamanho do `dist` é a única falha do PR (só o `build`, no passo "Tamanho do dist/index.html", e o `check` estão vermelhos); (2) o excesso (`tamanho − teto`) é de até 16 KiB (16.384 bytes); (3) o épico cresceu no máximo 32 KiB (32.768 bytes) sobre a `main`. A subida é de 16 KiB. Fora disso, chame o dono: épico que cresceu mais de 32 KiB (provável acidente, como uma dependência embutida inteira), subidas automáticas desde a última revisão do dono que passariam de 64 KiB (65.536 bytes) contando com esta, excesso acima de 16 KiB ou outra falha além do tamanho.
  - **Quem aplica:** quem tem o PR vermelho. No PR do épico, o coordenador, por subagente, num commit no `epic/<nome>` depois de trazer a `main`; no PR de uma fase, a própria fase (docs/FLOW.md), que cita a subida no aviso.
  - **Tamanho da `main`:** um subagente builda a `origin/main` num worktree descartável (`git worktree add`, `npm ci && npm run build`, `stat -c %s dist/index.html`, e remove o worktree). O tamanho do PR sai da anotação `::error` do passo ("<tamanho> bytes, acima do orçamento de <teto> bytes."). Se a `main` foi trazida depois dessa execução, o `--size` vem de um build do próprio head pós-merge, no mesmo worktree descartável (os dois tamanhos têm de ser do mesmo momento da `main`).
  - **Script:** `node scripts/ci/distBudget.mjs raise --ci .github/workflows/ci.yml --size <bytes> --main-size <bytes> --review-ceiling <bytes> --epic <nome> --write`; o `--review-ceiling` é a linha "Teto na última revisão do dono" da `roadmap` abaixo. Ele imprime "sobe: …" (e, com `--write`, troca o `INDEX_HTML_MAX_BYTES` e acrescenta a frase ao comentário do `ci.yml`) ou "chama o dono: <motivo>" (nada é gravado).
  - **Registro:** o mesmo commit da subida põe uma linha em `## Alterado` do `changelog/<nome>.md` ("Teto do `dist/index.html` subiu 16 KiB, de X para Y, pela regra do orçamento"). A `roadmap` fixa **"Orçamento do dist/index.html"** (`roadmap`, `impact: low`, com a linha `Impacto:`) é criada pelo coordenador na primeira subida, com a linha `Teto na última revisão do dono: <bytes> (<data>)` no corpo, valendo o teto de antes dessa primeira subida; cada subida (inclusive as da fase, que o coordenador registra ao ler o aviso) é um comentário nela com épico, PR, de → para, excesso e crescimento. Quando o dono revisa o orçamento, essa linha é atualizada; a issue fica aberta.

## Mudanças na fila durante a execução

A fila é refeita sempre que algo muda, sem parar o que está rodando.

- **Entre etapas** (passo 7 de "Por etapa"), o coordenador lista as `ready` de novo por conta própria.
- **`bug` da própria fila.** O `bug` `ready` da correção dependente (passo 4 de "Por etapa") entra na fila como linha `kind=bug`, `status: aguardando`, mesmo quando a fila foi chamada com a lista `#n ...`, porque é pendência da própria fila. Ele começa quando o #N de que depende for mesclado.
- **Nova `ready`.** Pode aparecer na releitura (só `list_issues`; peça a ficha só das que não estão no painel) ou porque o dono avisou ("tem uma ready nova", "entraram mais ready"). Leia-a como no passo 3 de "Fila" e aplique a "Ordem" de novo a **todas** as etapas que estão `aguardando`. Uma `bug` `severity: high` nova passa à frente das `medium` e `low` que ainda não começaram.
  - ▸ `row` da nova, `reorder` com a ordem nova e log "Nova ready #n incluída depois da #m (porquê)".
  - Se a ordem das que já estavam mudou, diga no chat em uma linha.
- **O dono pede outra ordem** ("faça a #X primeiro", "a #Y por último", "tira a #Z"). O pedido dele vale mais que a "Ordem". Só não vale quebrar uma dependência: nesse caso, diga qual dependência impede e ponha a etapa logo depois dela.
  - Pedido que vale para as próximas releituras (por exemplo "a #741 sempre por último") vira restrição fixa. Ela vai no log e no `current`, para a sessão seguinte também a respeitar.
  - ▸ `reorder` e log.
- **Etapa em andamento não volta para a fila.** O que já começou continua, salvo se o dono mandar parar aquela etapa. Nesse caso o épico fica aberto, a etapa fica `aguardando` com o passo "parada pelo dono", e as filhas dela recebem por `send_message` "Pare: o dono interrompeu a etapa".
- **Pausar** ("pausa", "não comece mais nada"): as etapas em andamento terminam, e nenhuma nova começa. ▸ `current` "Pausada pelo dono". **Retomar** ("continua", "pode seguir"): volta ao passo 7.
- **Issue que deixou de ser `ready`** (rótulo trocado ou fechada): sai da fila, com um log.

## Merge

Com o fechamento feito e o CI verde. Antes de mesclar, confira também o `SERVER_VERSION` da `origin/main`: se ele alcançou o do épico (outro épico foi mesclado no meio), o coordenador refaz a escolha da versão (regra 3), faz o push e espera o CI de novo antes de mesclar. Quem confere o CI e se o PR pode ser mesclado é um subagente (`model: "haiku"`, "Confira, só lendo, o PR #<n> de fabianofranca/mapping: os checks do último commit e se ele é mesclável. Devolva uma linha: verde e mesclável, ou o que falta, com o nome do check que falhou"):

- **Padrão:**
  - mande `PushNotification` "Etapa #<n> pronta: <resumo>. PR do épico: <link>" e pergunte pelo `AskUserQuestion` ("#<n> — mesclar o épico na main?"), com as opções "Mesclar (Recomendado)" e "Ainda não";
  - a etapa fica `esperando dono` no painel;
  - enquanto a resposta não chega, a próxima etapa livre já pode começar;
  - com "Mesclar", mescle (`merge_pull_request`, `merge_method: merge`).
- **Com `mesclar=auto`** (escrito pelo dono na chamada): mescle direto e mande `PushNotification` "#<n> mesclada: <resumo>".
- O merge, ou a pergunta ao dono, vem logo depois do CI verde e **não espera** o retorno do subagente do fechamento (passo 5 de "Por etapa").

**Não segure o merge de outro épico** à espera da Release do anterior: um épico pronto cuja Release não depende da anterior é mesclado sem esperar. A ordem das versões estáveis é garantida pela ordem dos merges, não pela espera.

Pode haver algo que o agente não consegue fazer: uma aprovação que o ruleset exige, ou uma tag ou release que precisa ser criada à mão. Nesse caso, mande `PushNotification` com o link, deixe a etapa `esperando dono` e siga com a próxima.

## Paralelo

Com `paralelo=2`, uma segunda etapa só começa ao lado da que está rodando quando:

- todas as dependências dela estão na `main`;
- os "Toca em:" das duas não têm arquivo em comum (`mcp/version.ts` não conta: a versão do MCP é escolhida no fechamento);
- as duas não mudam o schema ao mesmo tempo, porque o número da migração está no código.

**Vaga:** só as etapas `em andamento` ocupam vaga (a contagem do `painel.py show`). Não ocupa vaga a etapa `esperando dono` (merge pedido, achado da regra 1, aprovação do ruleset) nem a já começada que espera outra etapa (fica `aguardando`, com o passo "espera #N"). A etapa parada que volta (o dono respondeu, a dependência entrou na `main`) continua de onde parou, sem esperar vaga. Os "Toca em:" e o schema de uma etapa nova são comparados com **todas** as etapas começadas e ainda não mescladas, paradas inclusive, porque o código delas ainda não está na `main`.

Cada etapa tem o seu épico, as suas filhas e as suas conferências. Os avisos das filhas citam a fase, e é por ela que se sabe de que etapa é o aviso. Quando uma das duas é mesclada, a outra traz a `main` antes do fechamento se houver conflito (merge, nunca rebase).

## Painel

O painel é um artifact do tipo **Dashboard**. Tem 3 datasets de arquivo JSON e usa a página `painel/index.html` desta pasta. É o estado durável da fila: uma sessão nova o lê para retomar.

**Arquivos:** mantenha-os numa pasta do scratchpad com o script desta pasta. O subcomando vem **antes** da pasta. Os comandos são (`painel.py` = `python3 .claude/skills/implementar-fila/painel/painel.py`):

```bash
painel.py init <pasta>
painel.py start <pasta>
painel.py row <pasta> '#n' status=… stage=… step=… pr=… started=now ended=now
painel.py row <pasta> '#n' plan="<ficha>"            # a ficha da etapa
painel.py row <pasta> '#n' child="<id> <id>" childAt=now   # filhas que devem aviso; child= limpa
painel.py phase <pasta> '#n' CL3=ok
painel.py reorder <pasta> '#a' '#b' …
painel.py log <pasta> "texto"
painel.py current <pasta> "texto"
painel.py reserve <pasta> <trig_id>                  # a conferência de reserva da sessão
painel.py session <pasta> '#n' <id>                  # sessão criada para a etapa (sem repetir)
painel.py show <pasta>          # resumo: em andamento, filhas, atrasadas, reserva, últimas do log
painel.py show <pasta> '#n'     # uma linha inteira, com a ficha
```

O script diz quais arquivos mudou. Vários comandos seguidos vão numa só chamada do `Bash` (`&&`).

**Publicar uma atualização:**

1. Para cada arquivo que mudou, chame `Artifact` com `url` = o painel, `asset: true` e `file_path` (um JSON por chamada). O resultado traz o `url` (`/_blob/<id>`).
2. Faça um `ArtifactData` `batch` com um `update` em cada `datasets/<id>`:
   - `source: {kind: "file", url, name: "<id>.json", format: "json"}`;
   - `updated: {at, by: "Claude"}`;
   - `edit: {via: "claude", at}`;
   - `if_version`: a versão que o resultado anterior devolveu (na primeira vez, faça um `list` de `datasets`). Se a versão mudou no meio, leia de novo e refaça.
3. Diga em `current`, numa frase, o que está acontecendo agora.

Grave no `painel.py` **a cada avanço** (fase aberta e mesclada, PR, testador, correção, fechamento, merge, nova `ready`), cada um com a sua linha no `log` e o `current` atualizado, e **publique uma vez por ciclo**, no fim, só os arquivos que mudaram ("Economia de contexto", item 7). Nunca há duas publicações no mesmo ciclo; a conferência de hora em hora sem atrasadas não publica. Se um blob voltar 404, envie de novo e repõe o dataset.

**Achar ou criar** (sem `painel=<url>`):

1. `Artifact` `list` (`scope: "mine"`): o artifact mais recente com o título "Fila de desenvolvimento" ou "Mapping Fila" é o painel. Com `painel=novo`, pule este passo.
2. Achou: leia o `datasets/meta` dele (o `/_blob/<id>` com `Artifact` `read` e `path`).
   - Se o `current` não é "Fila concluída" e o `updatedAt` tem menos de 2 horas, outra fila pode estar escrevendo nele. Sem `sem-confirmar`, pergunte ao dono ("Usar um painel novo (Recomendado)" / "Usar este mesmo"); com `sem-confirmar`, crie um novo.
   - Senão, reaproveite: comece os arquivos com `init --force` (a fila nova substitui a anterior; os blobs antigos continuam no artifact) e, se o `files/index.html` dele for diferente da página desta pasta, troque-o por ela (`ArtifactData` `update` com `if_version`).
3. Não achou, ou precisa de um novo: crie como abaixo.

**Criar:**

1. `Artifact` `quickstart` com `intent: "other"`, que indica o tipo Dashboard. Publique com o `type_url` dele, `title: "Fila de desenvolvimento"` e `auto_open: "after_first_write"`.
2. Siga as instruções do tipo que vierem no resultado. Num `batch`, grave:
   - `dash/meta` `{title: "Fila de desenvolvimento", lang: "pt-BR"}`;
   - os 3 `datasets`, com `fixed: true` e os títulos "Fila de issues", "Estado da execução" e "Registro de passos";
   - `files/index.html` `{text}`, com a página desta pasta.
3. Faça o `check` que o tipo pede.
4. Diga o link ao dono.

## Troca de sessão

**Troca de sessão por contexto ou por skill grande.** Leia `external_metadata.context_usage` no `get_session` desta sessão entre etapas e, depois de passar de 60%, também a cada aviso de filha. **Acima de 60%**, passe a coordenação adiante: é o motivo de sempre para criar um sucessor (o outro é o skill novo grande, abaixo).

**Skill novo na `main`.** Entre etapas e em cada conferência de reserva, rode `git fetch -q origin main && git diff --quiet HEAD origin/main -- .claude/skills/implementar-fila/SKILL.md`. Saída diferente de zero quer dizer que o `SKILL.md` mudou: faça `git pull -q --ff-only origin main` e meça a mudança com `git diff --numstat <HEAD de antes> HEAD -- .claude/skills/implementar-fila/SKILL.md`.

- **Grande** (mais de 60 linhas mudadas, ou mudança em "Regras desta fila"): troque de sessão, depois de conferir a linhagem ("Limite de linhagem", antes dessa troca). Sem espaço na linhagem, vale o caminho do dono daquela seção.
- **Pequena:** releia o `SKILL.md` inteiro, nunca só o diff, na própria sessão, e grave no `log` do painel a prova: "skill <commit>: <regra> → <o que faço agora>".
  O `painel.py` novo vale a partir do próximo comando. Uma mudança só em `painel/` não dispara nada: a página nova do painel é publicada por quem a mudou.

**Limite de linhagem.** Cada sucessor é uma sessão criada por `create_session` dentro de outra, e o ambiente para num nível de linhagem. Antes de criar o sucessor, leia `lineage.depth` e `lineage.limit` no próprio `get_session`. Se `depth + 2 > limit`, **não crie o sucessor**: ele não conseguiria criar fases. Nesse caso, publique o painel, mande ao dono uma `PushNotification` com o comando de retomada completo (`/implementar-fila retomar anterior=<id desta sessão> painel=<url>` e os mesmos argumentos), para ele abrir num chat novo, que começa no nível 0, e diga no `current` "aguardando o dono abrir a sessão nova da fila". Siga trabalhando enquanto o contexto deixar.

**Na sessão antiga:**

1. Confira o limite de linhagem (acima). Publique o painel atualizado.
   Tudo o que a sessão nova precisa saber vai no painel: a ficha de cada etapa (`plan`), as filhas que devem aviso (`child`), o passo de cada etapa e, no `log`, os defeitos pendentes e as restrições fixas do dono.
2. Crie a sessão nova com `create_session`:
   - o mesmo `model`;
   - `source_url` do repositório, `source_revision` `main`;
   - título "Fila — coordenador";
   - mensagem: **só** `/implementar-fila retomar anterior=<id desta sessão> painel=<url>`, seguida dos mesmos argumentos desta sessão e de `sem-confirmar`. Copie `mesclar=auto` só se o dono o escreveu na chamada desta sessão. Sem notas de passagem: o que não está no painel, grave no `log` antes.
3. Mande a cada filha que ainda deve aviso (os `child` do painel) `send_message`: "O coordenador mudou: mande seus avisos para `<id novo>`".
4. Apague a sua conferência (`delete_trigger` com o `reserve` do painel).
5. Mande `PushNotification` "Fila passou para uma sessão nova" (contexto acima de 60%).
6. Termine. Se depois chegar o aviso de uma filha, encaminhe-o sem mudar nada à sessão nova (`send_message`) e termine de novo.

**Na sessão nova** (`retomar`):

1. Leia o painel: `ArtifactData` `list` de `datasets` e `Artifact` `read` com `path` = o id de cada `/_blob/<id>`, com `out_dir` na pasta do scratchpad. Não imprima os arquivos: rode `painel.py show`.
2. Não releia as issues nem as filhas: a ficha (`plan`), as filhas (`child`) e o passo estão no painel, e a sessão antiga já avisou as filhas do seu id. Sem `list_sessions`, sem `list_events` e sem `get_session` das filhas; a conferência de reserva cuida das que atrasarem.
3. Crie a sua conferência de reserva (`painel.py reserve`).
4. Depois de avisar as filhas (ou de confirmar que a antiga avisou), a sessão nova **arquiva a `anterior`** (`archive_session`) e grave no `log` "coordenador anterior arquivado". Continue de onde parou.

## Fim

Quando nenhuma etapa está em andamento nem aguardando (fora os `bug` da própria fila que esperam a dependência), confira antes as linhas `kind=bug` que a própria fila criou (passo 4 de "Por etapa"):

- dependência já mesclada e o `bug` ainda `aguardando`: roda antes de encerrar;
- dependência ainda em andamento ou `esperando dono`: a fila não encerra; segue com a conferência de hora em hora até a dependência entrar;
- dependência `falhou`: a fila encerra, e a tabela abaixo lista o `bug` em "o que espera o dono", com o #N.

Sem pendência dela:

1. Responda no chat com uma tabela, com uma linha por etapa: a issue com link, o resultado (concluída, falhou ou esperando dono), o PR do épico, a duração, o número de fases e de correções, e a versão do MCP. Depois liste as issues criadas (a busca `Origem: etapa` do GitHub as reúne), com link, e o que espera o dono.
2. Atualize o painel (`current` "Fila concluída") e apague a conferência de reserva (`delete_trigger` com o `reserve`).
3. Mande `PushNotification` com o total, por exemplo "Fila concluída: 8 mescladas, 1 esperando você".
4. Arquive o que sobrou nas `sessions` das etapas entregues (`archive_session`), mas não as de etapa `falhou` ou `esperando dono`. O coordenador não arquiva a si mesmo: o dono arquiva o chat quando quiser.
