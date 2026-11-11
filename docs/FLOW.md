# Fluxo automatizado — mensagens prontas

As regras estão no `docs/PROCESS.md`; aqui ficam as mensagens prontas e o passo a passo (orquestrador, busca de duplicadas e evidência de bug, CI e preview). Os trechos `<…>` são lacunas a preencher.

## Para o dono, nos três chats

1. Roadmap ou bug (qualquer modelo):

```text
Crie uma issue roadmap (ou bug, se for defeito): <ideia ou problema>. Origem: <de onde veio>.
```

Para um bug, o agente procura antes uma issue igual ou que o agrupe e põe o rótulo de severidade (`severity: high`, `severity: medium` ou `severity: low`), como diz o `docs/PROCESS.md` ("Bugs e evidência visual"). A `roadmap` nasce com o rótulo de impacto (`impact: high`, `impact: medium` ou `impact: low`) e a linha `Impacto:` no corpo ("Planejamento nas issues" › Impacto); a mensagem não precisa pedir.

2. Detalhamento (Fable ou Opus):

```text
Detalhe a issue #<roadmap ou bug> como etapa, com as fases e a tabela de modelos (linha Orquestrador e coluna Testador). Pergunte o que for decisão de produto. Ao terminar, ponha o rótulo `ready` e tire o `roadmap` (o `bug` e o `impact:` ficam).
```

Para detalhar de uma vez todas as `roadmap` e `bug` que ainda não estão `ready` (num chat no modo Auto): `/detalhar-backlog`. O skill (`.claude/skills/detalhar-backlog/SKILL.md`) cria um subagente Opus (ferramenta `Agent`, em segundo plano) que propõe juntar issues num épico só, para ter menos versões do MCP e uma rodada do testador só. Depois cria até 3 subagentes Opus de detalhamento por vez e traz as perguntas deles ao dono pelo seletor de perguntas, sempre com uma opção recomendada; as respostas voltam ao mesmo subagente por `SendMessage`. Como a ferramenta `Agent` aceita `effort`, cada unidade roda em esforço high quando os critérios da skill a apontam (schema ou formato, gravação do `mapping.json`, arquitetura transversal, plano grande) e em medium nos outros casos (`alto=#a,#b` força high, `alto=nenhum` põe tudo em medium), sem prompt manual para o dono. Antes de gravar o plano, cada detalhamento o confere contra o código da `main` (arquivos, versões, roteiros, fases do tamanho de uma sessão e sobreposição com as outras `ready` e `in-progress`). Cada etapa sai com a linha `**Depende de:**`, que dá a ordem da implementação; o `Depende de` cobre as `ready` e `in-progress` que mexem nos mesmos arquivos (sem contar os registros de cada épico nem o `mcp/version.ts`; compara o `docs/TESTING.md` por roteiro, o `docs/FLOW.md`, o `docs/PROCESS.md` e os `SKILL.md` por seção `##` (`docs/FLOW.md#<slug>`) e não conta a tabela de blocos, `docs/TESTING-NUVEM.md#blocos`), e toda issue que o skill cria leva a linha `Origem: etapa #<n>`.

3. Implementação (no modelo da linha Orquestrador, no modo Auto):

```text
Implemente a etapa #<etapa> no fluxo automatizado. Me chame só para confirmar o merge.
```

Para confirmar o merge final, o dono responde no chat de implementação: `pode mesclar`.

Para implementar em sequência todas as `ready` (num chat Sonnet no modo Auto): `/implementar-fila`. O skill (`.claude/skills/implementar-fila/SKILL.md`) ordena a fila pela linha `**Depende de:**`, pela severidade e pelo impacto, mostra a ordem e então faz, etapa por etapa, o papel deste orquestrador: fases, testador, correções até zerar os ❌ (a decisão do dono vira `bug` e a fila segue) e fechamento. O painel "Fila de desenvolvimento" é atualizado a cada aviso, e as leituras pesadas do GitHub vão por subagente, para o coordenador durar mais horas; a conferência de hora em hora também confere o contexto e a troca aos 35%. O merge de cada épico é pedido ao dono pelo seletor de perguntas, salvo quando ele escreve `mesclar=auto` na chamada. Outros argumentos: `paralelo=N` (padrão 2, pela nota de vagas `Vagas k/N`), `modelo=tabela`, `sem-confirmar` e `painel=<url>|novo` (sem ele, o skill reaproveita o painel "Fila de desenvolvimento" de antes). A versão do MCP no fechamento: é provisória ao abrir o épico e escolhida ao fechar (a próxima livre na `origin/main`, com `git merge origin/main` se outro épico entrou antes). A correção que só se resolve com código de outro épico não segura o épico: vira um `bug` `ready` com `Depende de: #N`, que a própria fila roda quando o #N é mesclado, e a fila só encerra sem `bug` dela pendente. Só a etapa `em andamento` ocupa vaga do `paralelo`: a que espera o dono ou outra etapa libera a vaga. O fechamento (issues do que ficou para depois e comentário na issue) corre por um subagente durante o CI do épico, e o merge vem logo depois do verde. O painel não tem tabela de issues: tem um cartão com o link da busca `Origem: etapa` do GitHub. A troca de sessão é por contexto (acima de 35%, o coordenador passa a fila a uma sessão nova, `retomar`, que se registra no painel como o coordenador <n> e arquiva a anterior depois de conferir o arquivamento no `get_session`; a sessão que não é a registrada não age e só encaminha à atual) ou por skill novo grande: skill novo na `main` grande (mais de 60 linhas alteradas ou mudança em "Regras desta fila") vira troca de sessão, depois de conferir a linhagem; o pequeno é aplicado na própria sessão (`git pull`, releitura do `SKILL.md` inteiro com `Read` e prova no `log`). Perto do limite de linhagem de sessões, o coordenador não cria sucessor: o dono abre o chat novo com o comando de retomada que ele envia. As sessões de cada etapa entregue (fases, testadores, correções) e o coordenador anterior são arquivadas.

Depois do merge, o orquestrador confere a Release do MCP: acha a execução do "MCP release" do commit do merge (`actions_list`), espera por ela (`send_later` de 15 min) e, com versão nova, confere que `mcp-v<versão>` existe (`get_release_by_tag`), não é pre-release, traz `mapping-mcp.js`, `setup.sh`, `SKILL.md`, `AGENTS.mapping.md` e `watch-comments.mjs` (cada um com o `.sha256`) e que as rc da versão sumiram; sem versão nova, que o `release` foi pulado. Em falha, ou com a execução ausente, notifica o dono com o link da execução e o plano B manual do `docs/MCP.md`. O resultado entra no comentário de fechamento e na notificação final.

## Orquestrador — passo a passo

As regras estão no `docs/PROCESS.md` ("Fluxo automatizado"); o skill `implementar-fila` faz o mesmo para uma fila de etapas. O **orquestrador** (o chat de implementação):

- lê a issue da etapa (que precisa estar `ready`), troca `ready` por `in-progress`, cria o `epic/<nome>` da `main` atualizada e abre o PR do épico para a `main` assim que houver diferença;
- para cada fase, na ordem, cria uma sessão filha (`create_session` com o `model` e o `effort` da tabela, `source_url` do repositório e `source_revision` no épico; nunca `permission_mode: plan`) com a mensagem da fase, que termina com "Coordenador: `<id do orquestrador>`"; agenda uma conferência de reserva (`send_later`, 30 a 60 min) e só passa à fase seguinte depois do aviso da anterior;
- depois da última fase, acha o ambiente "Mapping - testes" (`list_environments`) e cria a sessão do testador com os roteiros e a passada visual listados na sub-issue da última fase (lista de mais de 40 passos sem o R0: roda `node scripts/testing/round-guide.mjs --grupos <roteiros>` e cria uma sessão por grupo, até 5, como em "Rodada dirigida em grupos");
- **com ❌** no relato **ou com defeito pendente**, abre **uma** fase de correção ("Fase de correção") e retesta só os passos dos achados e os que as correções afetam (nunca o roteiro inteiro), **numa sessão só** com os achados de todos os grupos ou blocos ("Reteste junto"; a correção mesclada antes de o reteste começar entra nele; sem passo de roteiro afetado, o teste automatizado da correção basta). Chama o dono se falhar de novo, se o achado for de perda de dados, integridade do `mapping.json` ou segurança, ou se a correção pedir decisão de produto;
- **sem ❌ e sem defeito pendente**, faz o fechamento: renomeia o arquivo do épico em `changelog/` com a data (`git mv`, e a data no título), grava as pendências do DS no artefato (`docs/DESIGN-SYSTEM.md` › "Ao gravar") e renomeia o registro do épico em `docs/design-system/` com a data, escreve a descrição final do PR do épico com "Closes #<etapa>", comenta o fechamento na issue da etapa e abre uma issue `roadmap` (com o rótulo de impacto) ou `bug` para cada item que ficou para depois;
- notifica o dono no celular (`PushNotification`) com o resumo e o link do PR do épico, e mescla o épico na `main` **só depois de o dono responder "pode mesclar" no chat**;
- depois do merge, confere a Release do MCP (parágrafo "Depois do merge" acima).

**Limites:** o `.claude/settings.json` libera em `permissions.allow` os comandos de sempre (gates, `npx`, git sem push forçado) e nega o push forçado, para as fases não pararem nesses pedidos. Fase que não avisa até a conferência de reserva (`send_later`, 30 a 60 min): `get_session` (`status_bucket`) e `list_events`; com falha ou sessão parada, o orquestrador chama o dono.

## Bug: busca de duplicadas

Antes de criar um `bug` (`docs/PROCESS.md`, "Bugs e evidência visual"), procure duplicadas nas issues abertas (`list_issues` com o rótulo `bug`, lendo título e corpo, e também as `roadmap`, `ready` e `in-progress`) e, por palavra-chave (componente, arquivo, passo do roteiro, texto do erro), nas abertas e fechadas (`gh api -X GET search/issues -f q='repo:fabianofranca/mapping is:issue <termos>'`):

- **igual** (mesmo comportamento, mesma causa): não cria. Comenta na existente a origem nova, o branch e commit e a evidência; se a severidade nova for maior, troca o rótulo e diz por quê;
- **agrupável** (mesmo componente ou arquivo, mesma causa provável, mesmo passo do roteiro, ou a correção de um mexe no outro): se a existente ainda não é `ready` nem `in-progress`, o defeito entra nela como item numerado (origem, severidade do item, evidência), com um comentário dizendo o que entrou; o título se ajusta se precisar. Se ela já é `ready` ou `in-progress`, o plano não muda sozinho: cria a issue nova com "Relacionada: #N" e comenta o link na existente; o detalhamento decide se junta;
- **regressão** (o defeito de uma issue fechada voltou): issue nova que cita a fechada; não se reabre a antiga;
- duas abertas que são o mesmo defeito: o conteúdo vai para a mais completa e a outra fecha como duplicada (`state_reason: duplicate`, `duplicate_of`), como a #405 fez com a #387 a #390;
- o corpo (ou o comentário) registra a busca: "Duplicadas: nenhuma (busca: <termos>)" ou "Relacionada: #N".

## Bug: corpo e evidência

- **Corpo do bug:** o que acontece; o que era esperado e de onde vem (passo do `docs/TESTING.md`, doc, spec); passos para reproduzir; branch e commit; origem (link do relato ou do PR); a severidade e o porquê; a busca de duplicadas.
- **Evidência, quando der:** defeito visível na tela leva captura PNG recortada na área do problema (Playwright `page.screenshot({ clip })` ou `import -window root` + `convert -crop`), sem dado pessoal nem segredo. Defeito que não se vê (teste instável, acessibilidade lida pelo DOM) leva a saída do teste ou o trecho do DOM num bloco de código, no lugar da imagem.

## Evidência de bug

A imagem vai para o branch órfão `evidencias`, em `<issue>/<nome>.png`, onde `<issue>` é o número da issue (ou sub-issue) em que ela aparece primeiro; cria-se a issue primeiro, para ter o número.

```bash
git fetch origin evidencias
git worktree add <scratchpad>/evidencias origin/evidencias  # o worktree é a exceção do "Início de sessão"
cd <scratchpad>/evidencias && git switch -c evidencias-<issue>
mkdir -p <issue> && cp <captura>.png <issue>/<nome>.png
git add <issue> && git commit -m "Evidência de #<issue>: <nome>"
git push -u origin HEAD:evidencias
```

Depois edita-se o corpo da issue com `![descrição curta](https://github.com/fabianofranca/mapping/blob/evidencias/<issue>/<nome>.png?raw=true)` e remove-se o worktree (`git worktree remove`). Push recusado porque o branch andou: `git pull --rebase origin evidencias` e push de novo (os commits ainda são só seus; nunca push forçado). O `evidencias` só recebe imagens, num commit por issue; nunca vira PR nem é mesclado; não se apaga imagem de issue fechada.

## CI e preview

O CI roda só nos PRs (`pull_request`), uma vez por commit: branch sem PR não tem CI. Quando o CI de um PR termina verde, o `preview-on-pr.yml` (por `workflow_run`) dispara o Deploy com o branch e o SHA, que publica esse commit no preview (`/preview/`) sem validar de novo; há um preview só, o do último PR com CI verde. O `workflow_dispatch` do Deploy (sem `sha`) continua para publicar outro branch, rodando o `ci.yml` antes. Editar o PR (título, corpo ou base) não roda o CI, e não se troca a base de um PR aberto: com a base errada, abra um PR novo com a base certa, cujo `opened` roda o CI, e feche o antigo sem reabrir; nada de commit vazio nem de fechar e reabrir PR para rodar o CI.

## Para a sessão da fase

O orquestrador cria a sessão com `create_session`: `model` e `effort` da tabela, `source_url` do repositório, `source_revision` = `epic/<nome>`, nunca `permission_mode: plan`. Mensagem:

```text
Você é o agente da fase <código> — <título> da etapa #<etapa> do repositório `fabianofranca/mapping`, no fluxo automatizado (docs/PROCESS.md, "Fluxo automatizado"). Ninguém está olhando esta sessão: não pergunte nada ao dono.

1. Leia o `CLAUDE.md`, o `docs/PROCESS.md`, a issue #<etapa> com os comentários e a sub-issue #<fase>, que é o seu plano. Siga-a; não reabra decisões já tomadas.
2. Branch `<branch curto>`, saído do `epic/<nome>` atualizado. PR com base `epic/<nome>`, título "<código> — <título>", corpo começando com "Parte de #<fase>" e as seções de sempre (Resumo, Como testar, Decisões tomadas, Impacto no DS, Impacto nos agentes).
3. Subagentes e esforço: <da sub-issue, ex.: Sonnet medium; mecânicos Haiku low>. Os subagentes de edição (os que editam a partir de um briefing) rodam em `medium` (o trabalho mecânico segue em Haiku `low`); `high` só nos de revisão ou conferência. Subagente que passa de ~200k de contexto é trocado por um novo, com o briefing e o que já foi feito.
4. Todo briefing de mudança de comportamento ou correção segue a regra "teste primeiro" do `docs/PROCESS.md` ("Uso de modelos"): teste visto falhando antes do código, e o subagente devolve o nome dele e a falha.
5. Antes do PR: `npm run lint && npm run typecheck && npm test && npm run build`.
6. Acompanhe o PR (`subscribe_pr_activity`) e corrija o CI; com o CI verde, **mescle o próprio PR no épico** (o merge é da sessão da fase, nunca deixado para o coordenador; PR com conflito ou desatualizado porque o épico andou: `git fetch origin` e `git merge origin/epic/<nome>`, nunca rebase, empurre e recomece a **Espera do CI**), marque os checkboxes e feche a sub-issue (`completed`).
   - **Espera do CI:** nunca encerre o turno esperando o CI sem um `send_later` para si mesma: primeira conferência com um `send_later` de 4 min depois do push; ao acordar com o CI ainda rodando, agende outro de 2 em 2 min até 20 min desde o push; depois disso, de 8 em 8; cada push (de correção ou para trazer a `main`) recomeça a contagem dos 20 min (o CI de PR leva ~3 min, então a primeira conferência já costuma achá-lo verde, e o `subscribe_pr_activity` sozinho não acordou a sessão depois de uma reexecução; se o evento acordar a sessão antes, ela segue, e o `send_later` ainda pendente só confere e encerra o turno quando disparar).
   - **Leitura do CI:** leia-o no commit mais recente do PR com `pull_request_read` `get_check_runs` e `perPage` 100, nunca com `get_status` (o repositório não usa commit status: ele fica `pending` com 0 itens). O CI são os check runs dos jobs do `ci.yml`: `epic`, `static`, `test` (na matriz, `test (1)` a `test (4)`), `coverage`, `build`, `check` e `e2e`; os outros workflows não contam (MCP pre-release, outros apps), e um `skipped` do CI não é verde nem falha. Verde = `check`, `e2e` e, no PR de épico (`epic/*` para a `main`), `epic` em `success`, nenhum check run do CI `queued` ou `in_progress` e nenhum com `failure`, `cancelled` ou `timed_out`, olhando só a execução mais recente de cada job (o `cancel-in-progress` deixa `cancelled` de uma execução trocada no mesmo commit, e ela não conta). O `check` não espera o `e2e` nem o `epic` (correm em paralelo, e o `deploy.yml` também exige o `e2e`), por isso o `check` em `success` sozinho não basta. Sem `check` e `e2e` (e `epic`, no PR de épico) em `success` e sem falha, o CI ainda roda. O verde de um commit anterior não vale: depois de cada push, leia de novo.
   - **Runner abandonado:** a tentativa 1 vermelha é reexecutada sozinha pelo `ci-rerun.yml`; se a tentativa 2 também morrer por runner abandonado (`node scripts/ci/ciRerun.mjs decide` sobre `gh api "repos/fabianofranca/mapping/actions/runs/<id>/jobs?filter=latest&per_page=100"`), rode **uma** reexecução (`gh run rerun <id> --failed`), que é a segunda; depois de **2 reexecuções sem sucesso** (a tentativa 3 vermelha), avise o coordenador por `send_message` ("CI travado: <link da execução>, tentativas 1 a 3") e espere, sem reexecutar mais. Falha legítima (teste, lint, build, timeout) não se reexecuta: corrija o código.
   - **Teto do `dist/index.html`:** com o aviso "abaixo de 2 KiB" no resumo do job `build`, tente enxugar dentro do que a fase toca antes de abrir mão da margem e cite o que fez no Resumo do PR. Com o PR acima do teto e só o `build` (passo "Tamanho do dist/index.html") e o `check` vermelhos, rode `node scripts/ci/distBudget.mjs raise --ci .github/workflows/ci.yml --size <bytes do ::error> --main-size <bytes do dist/index.html da origin/main, de um build num worktree descartável> --review-ceiling <"Teto na última revisão do dono" da roadmap "Orçamento do dist/index.html", ou o teto atual se ela ainda não existe> --epic <nome> --write`: se imprimir "sobe: …" (excesso de até 14 KiB, épico com até 32 KiB a mais que a `main`, subidas desde a revisão do dono até 64 KiB), dê commit no seu branch com a linha em `## Alterado` do `changelog/<nome>.md` ("Teto do `dist/index.html` subiu 16 KiB, de X para Y, pela regra do orçamento") e cite a subida no aviso; se imprimir "chama o dono: …" ou houver outra falha, não suba o teto: mande os números e o motivo ao coordenador por `send_message`, como no item 8.
7. Ao terminar, avise o coordenador por `send_message` só com o PR já mesclado no épico (as mensagens de espera dos itens 6 e 8, "CI travado", "chama o dono" e a pergunta de decisão, vão antes, sem merge): o link do PR mesclado, um resumo de 5 a 10 linhas, as decisões tomadas fora da sub-issue e os "Defeitos pendentes" (ou "Defeitos pendentes: nenhum").
8. Decisão de produto que a sub-issue não cobre: não invente. Mande a pergunta e as opções ao coordenador por `send_message` e espere a resposta.
9. Defeito achado no caminho, fora do plano (docs/PROCESS.md, "Defeito achado durante a etapa"): se não pede decisão do dono e cabe no que a fase toca, corrija neste PR, com teste primeiro, e cite-o em "Corrigido fora do plano" no Resumo; se não cabe, liste-o nos "Defeitos pendentes" do aviso (o que acontece, onde, como reproduzir). Não abra issue `bug`, salvo para o que pede decisão do dono.
<Só quando a linha da fase pede coordenador high, xhigh ou max: 10. Revisão de código: depois dos gates e antes do push do PR, rode a skill `/code-review <nível da tabela> <base>..HEAD`, com `<base>` = `git merge-base origin/epic/<nome> HEAD`, sem `--comment` nem `--fix`. Cada achado segue esta regra: defeito que se confirma lendo o código, corrija no próprio PR, com teste primeiro (docs/PROCESS.md, "Defeito achado durante a etapa"); simplificação ou eficiência dentro do que a fase toca, aplique; o resto, descarte, com o motivo. Depois das correções, rode os gates de novo. O Resumo do PR ganha a linha "Revisão `/code-review <nível>`: N achados, X corrigidos, Y aplicados, Z descartados (motivos)".>
<Só na última fase: ponha o rótulo `mcp-rc` no PR.>

Coordenador: `<id da sessão do orquestrador>`
```

## Fase de correção

Com ❌ no relato **ou com defeito pendente** (os "Defeitos pendentes" dos avisos das fases e as observações do relato que são defeito e não pedem decisão do dono; docs/PROCESS.md, "Defeito achado durante a etapa"), o orquestrador cria uma sub-issue `step` de correção (com `parent_issue_number` da etapa, a lista dos achados com o link do comentário do relato, a dos defeitos pendentes com a origem de cada um e o aceite "os passos que falharam passam, cada achado foi reproduzido antes e conferido depois, e cada defeito tem um teste que o cobre") e uma sessão filha com a mesma mensagem da fase, apontando essa sub-issue. A correção **reproduz cada achado antes de mexer no código** (o teste automático que falha pelo motivo do relato; no achado visual ou manual, a mesma conferência do relato, a receita, o script ou o passo, rodada na sessão e vista falhando) e **confere de novo depois** que a mesma conferência passa, para um reteste bastar; o aviso traz o "antes" e "depois" de cada achado, e o achado não reproduzido não é dado como corrigido (vai aos "Defeitos pendentes" com o que se tentou). O limite de rodadas não muda; a sessão da correção mescla o próprio PR no épico, como a fase (item 6). Só uma correção por etapa: defeito achado depois dela vira issue `bug`. O achado que só se corrige com código de outro épico ainda fora da `main` vai para os "Defeitos pendentes" com "depende de #N" e vira um `bug` `ready` com `Depende de: #N`, sem esperar (skill `implementar-fila`, passo 4 de "Por etapa"); severidade high segue a regra 1 e o épico fica `esperando dono`. O que pede decisão do dono também vira issue `bug`, com a decisão e as opções no corpo, e entra no "ficou para depois" do fechamento. Na segunda falha, em achado de perda de dados, integridade do `mapping.json` ou segurança, ou se a correção pedir decisão de produto, o orquestrador chama o dono.

## Para o testador

O orquestrador acha o ambiente "Mapping - testes" com `list_environments` e cria a sessão com `create_session`, `source_url` do repositório e `source_revision` = `epic/<nome>`:

```text
Leia `docs/TESTING-NUVEM.md` e execute no modo dirigido: <roteiros da sub-issue da última fase>. Passada visual: <lista da sub-issue, ou "nenhuma">. Branch `epic/<nome>`, commit `<hash>`. Relato na sub-issue #<última fase>. Tag da release: <mcp-v…-rc.n, ou "sem R21">. R0 inteiro primeiro. Coordenador: `<id da sessão do orquestrador>`.
```

A lacuna da tag é sempre preenchida: se a lista traz o R21 (testa a release real), a rc do épico (`mcp-v<versão>-rc.<n>`); se não traz, `sem R21`.

Reteste, depois da correção (só os passos dos achados, nunca o roteiro inteiro; R0 só o R0.1 e os passos de que os achados dependem; passada visual só das janelas e dos diálogos dos achados). Os defeitos pendentes corrigidos entram pelos passos de roteiro que afetam; sem passo afetado, o teste automatizado da correção basta, e uma correção só de defeitos pendentes, sem passo de roteiro, dispensa o reteste:

```text
Leia `docs/TESTING-NUVEM.md` e execute no modo dirigido: os achados <números> do relato em <link do comentário><e os passos <lista> que as correções dos defeitos pendentes afetam>. Branch `epic/<nome>`, commit `<hash da correção>`. Relato na sub-issue #<fase de correção>. Tag da release: <mcp-v…-rc.n, ou "sem R21">. R0 só o R0.1 e os passos de que os achados dependem. Coordenador: `<id da sessão do orquestrador>`.
```

## Rodada dirigida em grupos

Quando a lista da seção **Testador** (ou do reteste), **sem o R0**, passa de **40 passos**, o orquestrador (o **coordenador**) a divide em grupos paralelos, em vez de uma sessão só ([`docs/TESTING-NUVEM.md`](TESTING-NUVEM.md), "Rodada dirigida em grupos"). No clone do épico, ele roda `node scripts/testing/round-guide.mjs --grupos <roteiros>`: o comando conta os passos, respeita as cadeias que não se separam e imprime uma linha `grupo k de n: <roteiros>` por grupo (até 40 passos, imprime "uma sessão" e vale a mensagem dirigida acima). No máximo 5 grupos. O coordenador cria os n grupos de uma vez: `list_environments` ("Mapping - testes"), `create_session` com `source_url` do repositório, `source_revision` = `epic/<nome>`, o mesmo commit em todos e o título "Testador — <alvo>, grupo <k> de <n>". Mensagem do grupo `<k>`:

```text
Leia `docs/TESTING-NUVEM.md` e execute no modo dirigido, grupo <k> de <n>: <roteiros da linha "grupo k de n" do round-guide.mjs>. Passada visual: <lista da sub-issue, em um grupo só; "nenhuma" nos outros>. Branch `epic/<nome>`, commit `<hash>`. Relato na sub-issue #<última fase>. Tag da release: <mcp-v…-rc.n, ou "sem R21">. <No grupo 1: R0 inteiro primeiro. Nos outros: R0 só o R0.1 e os passos de que os roteiros do grupo dependem.> Coordenador: `<id da sessão do coordenador>`.
```

- **Tag da release:** só o grupo que tem o R21 leva a rc do épico; nos outros a lacuna é `sem R21`.
- **Conferência de reserva:** agenda um `send_later` de 60 min e só segue com os **n avisos** (um por grupo, cada um cita o grupo). Grupo que não avisou até lá: `get_session` (`status_bucket`) e `list_events`; com falha ou sessão parada, chama o dono.
- **Com os n avisos,** posta o resumo (o template de "Resumo da rodada em blocos", com "Grupo" no lugar de "Bloco" e o título "Rodada dirigida em grupos — resumo") na mesma sub-issue. O coordenador não reescreve os relatos.
- **Com ❌,** o fluxo de sempre, e o reteste é **uma sessão só** (abaixo).

## Reteste junto

O reteste de uma etapa é **uma sessão só**, com os achados de **todos** os grupos ou blocos (códigos `k.n`, com o link do comentário de cada um) e os passos que as correções dos defeitos pendentes afetam, na mensagem de reteste de "Para o testador". Só se divide em grupos se a lista, sem o R0, passar de 40 passos (mesma regra acima). Se outra correção for mesclada no épico enquanto o reteste ainda não começou, ela entra no mesmo reteste: o commit da mensagem é o do épico depois dela, e os passos que ela afeta se somam à lista.

## Rodada completa em 5 blocos

Quando a seção **Testador** da sub-issue da última fase pede a rodada completa, o orquestrador (o **coordenador**) cria **cinco** sessões do testador de uma vez, uma por bloco da tabela de [`docs/TESTING-NUVEM.md`](TESTING-NUVEM.md) ("Rodada completa em blocos"). Cada uma usa `list_environments` ("Mapping - testes"), `create_session` com `source_url` do repositório, `source_revision` = `epic/<nome>`, o mesmo commit nas cinco e o título "Testador — <alvo>, bloco <k> de 5". Mensagem do bloco `<k>` (1 a 5):

```text
Leia `docs/TESTING-NUVEM.md` e execute o modo completo, bloco <k> de 5. Passada visual: <lista da sub-issue, no bloco 4; "no bloco 4" nos blocos 1, 2, 3 e 5>. Branch `epic/<nome>`, commit `<hash>`. Relato na sub-issue #<última fase>. Tag da release: <mcp-v…-rc.n, ou "sem R21">. Coordenador: `<id da sessão do coordenador>`.
```

- **Tag da release:** só o bloco 5 tem o R21; nos blocos 1 a 4 a lacuna é `sem R21`, e no 5 é a rc do épico (numa rodada na `main`, a última estável).
- **Conferência de reserva:** agenda um `send_later` de 60 min e só segue com os **cinco avisos** (um por bloco, cada um cita o bloco). Bloco que não avisou até lá: `get_session` (`status_bucket`) e `list_events`; com falha ou sessão parada, chama o dono.
- **Com os cinco avisos,** posta o resumo (abaixo) na mesma sub-issue. O coordenador não reescreve os relatos.
- **Com ❌,** o fluxo de sempre: uma fase de correção com os achados dos cinco blocos (códigos `k.n`, com o link do comentário de cada um) e o reteste dirigido numa sessão só ("Reteste junto"), pelos achados `k.n` de todos os blocos, na mensagem de reteste acima.

### Rodada avulsa (do dono)

O dono manda num chat Sonnet no modo **Auto**:

```text
Rode a rodada completa do testador em blocos no branch `<branch>`, commit `<hash>`. Resumo e relatos na issue #<N>.
```

Esse chat é o coordenador: cria os cinco blocos como acima (relato na issue `#<N>`, coordenador = o id dele), espera os cinco avisos, posta o resumo e, para cada ❌, abre uma issue `bug` com a busca de duplicadas do `docs/PROCESS.md` ("Bugs e evidência visual"), com a severidade e o link do relato. Não corrige nada e não abre fase de correção.

## Resumo da rodada em blocos

Um comentário curto na mesma sub-issue (ou issue), depois dos cinco avisos. Na rodada dirigida em grupos, o mesmo template vale com "Grupo" no lugar de "Bloco", as linhas dos n grupos e o título "Rodada dirigida em grupos — resumo". O coordenador não reescreve os relatos: só soma e aponta para eles.

```markdown
## Rodada completa em blocos — resumo

Branch `<branch>`, commit `<hash>`.

| Bloco | ✅  | ❌  | não executado | Tempo             |
| ----- | --- | --- | ------------- | ----------------- |
| 1     | N   | N   | N             | <min>             |
| 2     | N   | N   | N             | <min>             |
| 3     | N   | N   | N             | <min>             |
| 4     | N   | N   | N             | <min>             |
| 5     | N   | N   | N             | <min>             |
| Total | N   | N   | N             | <soma dos blocos> |

- **Achados por severidade:** bloqueia N, alta N, média N, baixa N.
  - <k.n> — <título> — <severidade> — <link do comentário>
- **Tempo:** soma dos blocos <min>; tempo de parede <min> (da criação do primeiro bloco ao último aviso). Os tempos de cada bloco são os do relato ("Tempo por roteiro"); sem o dado, "tempo não medido".
- **Relatos:** bloco 1 <link>, bloco 2 <link>, bloco 3 <link>, bloco 4 <link>, bloco 5 <link>.

<rodapé de atribuição>
```

## Notificação final

`PushNotification`, depois do fechamento:

```text
Etapa #<etapa> pronta: <resumo em uma linha>. PR do épico: <link>. Responda "pode mesclar" no chat.
```

## Revisão de código

As regras estão no `docs/PROCESS.md` ("Revisão de código"). O revisor só lê o código: não corrige nada, não faz commit, push nem PR e não comenta PRs. A saída é uma issue da rodada e as issues `bug`, todas com o rótulo `code-review`.

### Como roda

- **Agendamento "CR por épico"** (`trig_01NnLQbxT56N2JciyDxdnP4j`), todo dia às 02:50 (`CRON_TZ=America/Sao_Paulo 50 2 * * *`). Ele dispara na **sessão coordenadora** `session_01Y37a9rGc6hS2VxVbVDhCcq` ("CR — coordenador (não arquivar)"), não numa sessão nova: a sessão aberta direto por um agendamento nasce sem o repositório e recebe 403 da API do GitHub, e o `add_repo` não existe nela. Se a coordenadora for arquivada, o agendamento para de funcionar (ver "Recriar a coordenadora"). O agendamento antigo, `trig_01HVM7XdLhjVuhwHSFz7AiCf`, está desativado, não apagado.
- **A coordenadora** faz três passos, com os mesmos comandos do prompt do agendamento:
  1. **Lista** os épicos mesclados na `main` depois do ponto base do CR base (commit `4532e75`, que fica fora da lista), pela história da `main` e não pela API: `git fetch -q --shallow-since=2026-11-08T00:00:00Z origin main && git merge-base --is-ancestor 4532e75 origin/main && git log --reverse --first-parent --format='%H %s' 4532e75..origin/main | sed -nE 's|^([0-9a-f]+) Merge pull request #([0-9]+) from fabianofranca/epic/(.+)$|\2\t\3\t\1|p'`. Cada linha é um épico, do mais antigo para o mais novo: PR, nome e `merge_commit_sha`. O clone da sessão é raso, e o `--shallow-since` traz a história desde o ponto base. Se o comando sair com erro (o `4532e75` não está na história da `origin/main`), ela avisa o dono com o erro e para.
  2. **Pula** os que já tiveram CR do épico inteiro no fechamento, decidindo pelo commit. A rede de segurança da #1324 entrou na `main` com o merge `55b2491` (PR #1381), e o `scripts/ci/riskTriggers.mjs`, com o merge `63e58b9` (PR #1434). Para cada épico, pelo `merge_commit_sha`:
     - se `git merge-base --is-ancestor 55b2491 <merge_commit_sha>` falhar (merge anterior à rede de segurança), o épico entra na rodada (45 dos 65 épicos de 2026-11-11);
     - se o merge contém o `55b2491` mas `git merge-base --is-ancestor 63e58b9 <merge_commit_sha>` falhar, é um dos seis merges sem o script (a lista não cresce, porque o intervalo já fechou), decididos pelo comentário de fechamento da etapa: os PRs #1381, #1343, #1418 e #1417 são pulados e anotados como "CR no fechamento", e os PRs #1373 e #1419 entram na rodada;
     - nos outros (14 de 2026-11-11), roda no clone `git checkout -q <merge_commit_sha> && node scripts/ci/riskTriggers.mjs --base <merge_commit_sha>^1`. Com ao menos uma linha `gatilho:`, o épico teve CR no fechamento: é pulado e anotado como "CR no fechamento". Com `nenhum gatilho`, o épico entra na rodada. Com outra saída ou erro, ele também entra (na dúvida, revisar a mais custa menos que deixar um épico sem revisão), e a notificação cita o PR e a saída;
     - volta para `origin/main` depois (`git checkout -q origin/main`).
  3. **Procura a issue da rodada** de cada um que sobrou, pelo marcador no corpo e pelo título: `gh api -X GET search/issues -f q='repo:fabianofranca/mapping is:issue label:code-review in:body "cr-epic: pr=<n>"'` e `gh api -X GET search/issues -f q='repo:fabianofranca/mapping is:issue label:code-review in:title "CR épico" "PR #<n>"'`. Se uma das duas achar a issue, o épico é pulado. O marcador acha a issue mesmo depois de o detalhamento trocar o título dela (a #1188, a rodada do PR #938, foi renomeada).

  Dos que sobram, cria até 3 sessões revisoras por noite (`create_session` com `source_url` do repositório, Sonnet), os mais antigos primeiro. As que sobram ficam para a noite seguinte. Sem épico novo, não faz nada. Na notificação ao dono, diz quantos épicos foram pulados por "CR no fechamento" e os PRs em que o script deu outra saída.

- **Cada revisor** aprofunda o clone raso e lê o diff do épico (`git fetch -q --shallow-since=2026-11-08T00:00:00Z origin main && git diff <merge>^1 <merge>`), o PR e a issue da etapa, e avisa a coordenadora por `send_message`. Com todos os avisos da noite, a coordenadora notifica o dono com os links, os achados, os `bug`, o custo e os épicos pulados.
- **Recriar a coordenadora**, quando ela for arquivada ou sumir. O `update_trigger` não troca a sessão de um agendamento, então:
  1. `create_session` com `source_url` `https://github.com/fabianofranca/mapping`, Sonnet e o título "CR — coordenador (não arquivar)";
  2. `create_trigger` com `persistent_session_id` da sessão nova, nome "CR por épico", `cron_expression` `CRON_TZ=America/Sao_Paulo 50 2 * * *` e o prompt lido por `get_trigger` no agendamento atual, com o id novo no passo 8 da mensagem-modelo;
  3. `update_trigger` com `enabled: false` no agendamento antigo, sem apagá-lo;
  4. uma issue `roadmap` para trocar os ids neste arquivo (no "Como roda" e no passo 8 do bloco abaixo).
- **O prompt do agendamento** guarda a MENSAGEM-MODELO do revisor, e o bloco de "Para o revisor do CR por épico" é a cópia dela, letra por letra. Quem muda o bloco lê o prompt com `get_trigger` e o atualiza (`update_trigger`) no mesmo épico. O CI não lê o agendamento: o `tests/tooling/epicCodeReview.test.ts` confere só este lado, e o fechamento do épico revisa a mudança porque o `docs/FLOW.md` é gatilho de risco.

### Limitações conhecidas

- O `/code-review` só serve com um diff. Para revisar arquivos inteiros (como no CR base), o revisor lê os arquivos; num diff, se a skill devolver achados de arquivos fora dele, eles são descartados.
- Use a API REST: `gh api -X POST repos/fabianofranca/mapping/issues …`. `gh issue create`, `gh repo clone` e GraphQL falham nessas sessões. Na busca, escreva `-X GET`, porque `gh api` com `-f` vira POST.
- As sessões nascem com clone raso (depth 50): sem o `--shallow-since`, a lista do passo 1 sai curta sem erro, e o `<merge>^1` dos merges antigos não existe. O `gh api --paginate` não pagina nessas sessões, porque o proxy recusa a página 2 com 403.
- Os defeitos high e medium são conferidos lendo o código, não executando a app; os low não são reconferidos.
- Épico fechado **fora da fila** (pelo fluxo manual): se o diff tem gatilho, o `riskTriggers.mjs` aponta `gatilho:` e o CR noturno o pula, mesmo sem `/code-review high` no fechamento, porque a rede de segurança só existe no skill `implementar-fila`. O critério e o fluxo manual não mudam (decisão do dono de 2026-11-11).

### CR base (2026-11-08)

Revisão única da `main` inteira no commit `4532e7519cc06c9adf849ee254be1ed636f783a9`, em 6 blocos paralelos (cerca de 120 mil linhas de produção, US$ 46 equivalentes, 30 minutos): #945 (`src/model/`), #954 (`src/ui/`), #940 (`src/canvas/` e `src/store/`), #965 (`mcp/`), #971 (`src/app/`, `src/storage/`, `src/utils/`, `viewer/`, `pwa/`, `scripts/` e `.github/`) e #964 (`src/i18n/` e `src/theme/`). É o ponto de partida do "CR por épico".

### Para o revisor do CR por épico

A mensagem abaixo é a cópia da MENSAGEM-MODELO do prompt do agendamento; a coordenadora troca `{nome}`, `{pr}` e `{sha}` e a manda ao criar cada revisor.

```text
Você é o revisor do CR por épico do repositório fabianofranca/mapping: épico `epic/{nome}`, PR #{pr}, commit de merge `{sha}`. Ninguém está acompanhando: não faça perguntas. Leia o CLAUDE.md antes de começar.

Esta revisão é SOMENTE LEITURA no código: não corrija nada, não faça commit nem push, não abra PR, não comente PRs. O único efeito permitido são issues novas e comentários em issues `bug` existentes.

1. O código revisado é o diff do épico: `git fetch -q --shallow-since=2026-11-08T00:00:00Z origin main && git diff {sha}^1 {sha}` (o que o épico mudou em relação à `main` daquele momento; o clone da sessão é raso, e o `--shallow-since` traz o `{sha}^1` dos merges antigos). Leia a descrição do PR #{pr} e a issue da etapa ("Closes #N"), com as sub-issues das fases, para saber a intenção e as decisões. Arquivos inteiros só para contexto.
2. Diff até 3 mil linhas de produção: revise com a skill `/code-review` no nível high, alvo `{sha}^1..{sha}` (sem --comment e sem --fix); se a skill devolver achados de arquivos fora do diff, descarte-os e revise lendo o diff. Maior que isso: divida por área em pedaços de até 3 mil linhas, um subagente Sonnet por pedaço (até 5 em paralelo, esforço high), cada um revisando o diff do seu pedaço (`git diff {sha}^1 {sha} -- <arquivos>`) com os arquivos inteiros para contexto. Testes: só para entender a intenção e apontar caso não coberto de comportamento novo. Procure: defeitos de corretude e regressões; violações das regras de arquitetura e de código do CLAUDE.md (model sem API de navegador, mutação fora de action do store, Konva fora de src/canvas, consulta por id fora do projectIndex, string de UI fora de t(), valor de design fora dos tokens, regras de CSP, complexidade acima de 10 fora das supressões); simplificação, reuso e eficiência. Cada achado: arquivo:linha, o que está errado ou pode melhorar, categoria (defeito, simplificação, eficiência, estilo), severidade (high, medium ou low, conforme o CLAUDE.md) para defeito, e o trecho que sustenta.
3. Confirme cada defeito lendo o código no commit `{sha}` (você ou um subagente de conferência, esforço high). Descarte o que não se sustentar.
4. Crie UMA issue "CR épico {nome} (PR #{pr})" com os rótulos `roadmap` e `code-review`, exatamente um rótulo `impact:` e a linha `Impacto: <nível> — <porquê>` (seção "Impacto" do docs/PROCESS.md). O corpo, em pt-BR, traz o épico, o PR, a issue da etapa, o commit e os achados numerados e agrupados por arquivo, cada um com o link `https://github.com/fabianofranca/mapping/blob/{sha}/<arquivo>#L<linha>`, o que é, a categoria e a severidade (para defeito). Sem achados, a issue diz "sem achados". Termine o corpo, antes do rodapé, com `<!-- cr-epic: pr={pr} sha={sha} -->`.
5. Para cada DEFEITO CONFIRMADO de severidade high ou medium, siga "Bugs e evidência visual" do docs/PROCESS.md: procure duplicadas nas issues abertas e fechadas (inclusive as com o rótulo `code-review`); sem duplicada, crie uma issue `bug` com os rótulos `bug`, `code-review` e exatamente um rótulo de severidade, e o corpo completo (o que acontece, o esperado e de onde vem, passos para reproduzir, commit, origem com o link da issue da rodada e do PR, severidade e porquê, "Duplicadas: nenhuma (busca: <termos>)"); com duplicada ou agrupável, comente nela. Defeitos low ficam só na issue da rodada. Na issue da rodada, aponte cada `bug` criado ou comentado.
6. GitHub só pela API REST: `gh api -X POST repos/fabianofranca/mapping/issues -f title=... -f body=... -f 'labels[]=...'` e `gh api -X POST repos/fabianofranca/mapping/issues/<n>/comments -f body=...`. `gh issue create`, `gh repo clone` e GraphQL não funcionam nesta sessão. Busca: `gh api -X GET search/issues -f q='repo:fabianofranca/mapping is:issue <termos>'` (com `-X GET` explícito; sem ele o `-f` vira POST).
7. Todo texto no GitHub termina com o rodapé: linha `---` e `_Generated by [Claude Code](https://claude.ai/code)_`.
8. Ao terminar (ou se travar), avise o coordenador por `send_message` (session_id session_01Y37a9rGc6hS2VxVbVDhCcq) com: link da issue, total de achados por categoria, os `bug` criados ou comentados, e o que falhou. Coordenador: `session_01Y37a9rGc6hS2VxVbVDhCcq`.
```

## Supervisão da fila

A supervisão da fila é a skill `/supervisionar-fila` (`.claude/skills/supervisionar-fila/SKILL.md`), numa sessão Opus `high` fora da fila. Para abrir, abra uma sessão nova em `claude-opus-5-5` com `effort: high` e mande `/supervisionar-fila painel=<url do painel>`. Para retomar, a sessão antiga cria a sucessora sozinha a ~25% de contexto, com `/supervisionar-fila retomar anterior=<id>`, e a passagem fica no artefato "Supervisão da fila". Os pedidos do tipo A vão direto ao coordenador (`SUP-<n>`), e os do tipo B o coordenador pergunta a você no chat da fila. `/supervisionar-fila custo` e `varredura desde=<ISO>` respondem sobre o custo.
