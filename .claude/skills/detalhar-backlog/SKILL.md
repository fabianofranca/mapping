---
name: detalhar-backlog
description: Coordena subagentes Opus (ferramenta `Agent`, com esforço high ou medium pelos critérios da skill) que detalham, como etapas `ready`, todas as issues abertas `roadmap` e `bug` do fabianofranca/mapping que ainda não estão `ready` nem `in-progress`. Antes de detalhar, um subagente de agrupamento propõe juntar issues num épico só (menos versões pequenas do MCP, uma rodada do testador para várias) e o dono decide. As perguntas dos subagentes chegam ao dono sempre pelo seletor de perguntas, com uma opção recomendada. Use quando o dono pedir para detalhar o backlog, as roadmap, os bugs pendentes ou "tudo que não está ready", ou rodar /detalhar-backlog.
---

# Detalhar o backlog

Esta sessão é o **coordenador**. Ela não detalha nada sozinha: cria os subagentes Opus (ferramenta `Agent`), leva as perguntas deles ao dono, devolve as respostas e confere o resultado. Quem detalha segue o `docs/PROCESS.md` ("Detalhar uma etapa", "Impacto", "Bugs e evidência visual", "Uso de modelos" e "Fluxo automatizado", item 2).

Rode este chat no modo **Auto**: um subagente que pede permissão fica parado, porque ninguém está olhando (`docs/PROCESS.md`, "Limitações"). O coordenador pode rodar em Sonnet; o julgamento fica com os subagentes, que rodam em Opus.

A ferramenta `Agent` aceita `model` e `effort` (uma sessão filha só aceitaria o modelo). **Esta skill é o pedido explícito de esforço:** todo subagente nasce com `subagent_type: general-purpose`, `model: opus`, `run_in_background: true` e `effort` explícito, `medium` no agrupamento e `high` ou `medium` por unidade, pelos critérios de "Esforço do detalhamento". Cada subagente faz a unidade inteira (lê, rascunha, confere, pergunta pelo coordenador e grava as issues), então todo o julgamento fica no esforço pedido. Nenhum prompt manual para o dono abrir sessão.

## Argumentos

`/detalhar-backlog [#n ...] [paralelo=N] [sem-agrupar] [alto=#a,#b|nenhum]`

- `#n ...`: detalha só essas issues. Sem a lista, detalha todas as candidatas.
- `paralelo=N`: quantos subagentes de detalhamento rodam ao mesmo tempo. O padrão é **3**.
- `sem-agrupar`: pula o agrupamento, e cada issue vira a sua própria etapa.
- `alto=#a,#b`: essas issues (ou os grupos que as contêm) pedem esforço high, além das que os critérios apontarem. `alto=nenhum`: nenhuma unidade é tratada como high, e todas rodam em `effort: medium`.

## Regra das perguntas ao dono

Toda pergunta ao dono passa pela ferramenta de perguntas (`AskUserQuestion`), **nunca** por texto solto no chat:

- cada pergunta se sustenta sozinha, porque o dono pode ver só o diálogo: ela começa por `#<n> — ` e cita o que precisa da issue;
- tem de 2 a 4 opções, e a **recomendada** vem primeiro, com " (Recomendado)" no fim do rótulo;
- o cabeçalho tem no máximo 12 caracteres;
- vão no máximo 4 perguntas por chamada. Se houver mais, faça outra chamada, uma issue (ou grupo) por chamada sempre que der;
- a resposta em "Outro" e as notas do dono vão para o subagente **sem mudar nenhuma palavra**.

Antes de cada chamada, mande um `PushNotification` curto, por exemplo "Detalhamento: 2 perguntas da #896". O dono usa o celular e pode não estar olhando o chat. Carregue o `PushNotification` com o `ToolSearch` se ainda não estiver carregado; o `AskUserQuestion` só se ele aparecer na lista de ferramentas adiadas.

## Esforço do detalhamento

O detalhamento de uma unidade roda em `effort: high` quando o plano depende de julgamento fino, e um erro nele custa caro na implementação. Pede high a unidade que:

- mexe em schema, num formato (`docs/FORMAT.md`, `docs/SPEC-FORMAT.md`, `docs/COMMENT-FORMAT.md`) ou numa migração;
- toca a gravação ou a integridade do `mapping.json` (`src/store/session.ts`, revisão, conflito), perda de dados ou segurança (CSP, Trusted Types);
- mexe em regra de arquitetura transversal: o assentar da hierarquia (`src/model/hierarchySettle.ts`), o store e o desfazer, o `projectIndex`, o `CanvasController`, o contrato das tools do MCP;
- deve passar de umas 5 fases, ou junta 4 ou mais issues;
- inclui uma `ready` cujo plano muda (replanejamento), ou é uma rodada `code-review` com muitos achados a planejar.

Quanto às **fases** da tabela de modelos e esforço (decisão 11 da #1324): a fase que toca a infraestrutura do fluxo ou algo crítico recebe coordenador **high com `/code-review high`**, qualquer que seja o tamanho. Gatilhos de risco:

- os skills `implementar-fila` e `detalhar-backlog`, o `painel.py`, ou uma regra (não só o texto) do `docs/FLOW.md` ou do `docs/PROCESS.md`;
- `.github/workflows/`, `scripts/release/` ou `mcp/version.ts`;
- a versão do schema ou do formato (`formatVersion`);
- a gravação do `mapping.json` (`src/store/session.ts`) ou a CSP (`pwa/csp.ts`).

A linha da fase diz qual gatilho a fez high (por exemplo, "Sonnet high, com `/code-review high` (gatilho: skill implementar-fila)"). Quem acrescenta uma decisão a uma etapa em andamento **reclassifica** o esforço das fases que ainda não terminaram; se uma passar a high, a fase é avisada de que a `/code-review high` passa a valer.

O resto roda em `effort: medium`. Na dúvida, recomende high (`docs/PROCESS.md`: na dúvida, vale o maior), com o motivo. O argumento `alto=` soma unidades ou desliga a regra.

## 1. Candidatas

1. `list_issues` (`state: OPEN`, `fields: [number, title, labels]`, sem `body`, porque o corpo de todas passa do limite) uma vez com `labels: [roadmap]` e uma com `labels: [bug]`.
2. Fique só com as que **não** têm `ready`, `in-progress` nem `step`. Com a lista `#n ...`, use a interseção dela com as candidatas e diga quais números ficaram de fora e por quê.
3. Ordem: `severity: high` e `impact: high` primeiro, depois `medium`, depois `low`; no empate, o menor número vem antes. A ordem do Project "Mapping - Backlog" é do dono, e as ferramentas não alcançam o Project.
4. Issues do revisor de código (rótulo `code-review`, `docs/PROCESS.md` "Revisão de código"): a da rodada (`roadmap`, título "CR base …" ou "CR épico …") lista muitos achados, e cada defeito high ou medium dela já tem a sua issue `bug`, citada no corpo. O detalhamento da rodada cobre só os achados que **não** apontam para um `bug`. Passe isso ao subagente de agrupamento, para ela juntar cada `bug` com a rodada ou com outras candidatas da mesma área, ou separar a rodada por área, sem detalhar o mesmo achado duas vezes.
5. Sem candidatas, diga isso e termine.

## 2. Agrupamento (um subagente Opus)

Pule este passo com `sem-agrupar` ou com uma candidata só.

Crie **um** subagente de agrupamento com a ferramenta `Agent`:

- `subagent_type`: `general-purpose`, `model`: `opus`, `effort`: `medium`, `run_in_background`: `true`;
- `description`: "Agrupamento do backlog".

Mensagem:

```text
Você é um subagente do coordenador: não pergunte nada ao dono, e o seu relatório final é a mensagem ao coordenador. Você é o agente de agrupamento do backlog do `fabianofranca/mapping`. Não edite issue, não crie branch nem PR.

1. Leia o `CLAUDE.md`, o `docs/PROCESS.md`, as candidatas <lista #n — título — rótulos> (corpo e comentários) e as issues `ready` abertas (corpo; as sub-issues `step` só quando precisar). Não proponha mexer nas `in-progress`.
2. Proponha grupos: candidatas que valem mais num épico só do que em épicos separados. Nas issues `code-review`, um achado da rodada que aponta para um `bug` pertence a esse `bug`; a rodada, que é uma lista longa, pode ser dividida por área entre vários grupos (diga quais itens vão para cada um). Pese:
   - versão do MCP: várias etapas que subiriam o MCP cada uma (minor ou patch) viram uma versão só;
   - rodada do testador: roteiros iguais ou próximos rodam numa rodada só (`docs/TESTING-NUVEM.md`);
   - mesma área, os mesmos arquivos ou a mesma ordem proposta: menos conflito e menos merge da `main` no épico;
   - mesmo formato ou schema: uma subida de versão e uma migração só;
   - o custo de juntar: o épico grande demora mais a chegar à `main` e uma falha segura todo mundo. Recomende no máximo umas 8 fases por épico e não junte o que tem condição de entrada não cumprida.
   - grupo com algum `bug`: a principal é o `bug` de maior severidade (no empate, o menor número), porque a etapa fica `bug` com a maior severidade do grupo.
3. Diga também quais issues `ready` (não `in-progress`) entrariam bem num grupo. Juntar uma `ready` muda um plano já fechado, e isso é do dono: proponha, não decida.
4. Marque como bloqueada a candidata com condição de entrada não cumprida (dependência externa, decisão anterior pendente), com o motivo.
5. Para cada grupo e cada sozinha, diga se o detalhamento pede esforço high, pelos critérios de "Esforço do detalhamento" do skill `.claude/skills/detalhar-backlog/SKILL.md`, com o motivo em uma linha. Avalie o grupo como ficaria se o dono o aprovasse.
6. Termine com a proposta como relatório final, exatamente neste formato:

AGRUPAMENTO
G1. <nome curto> — #a, #b, #c<, + ready #d>
  Por quê: <versões e rodada que economiza, área comum, riscos>
  Principal: #a (a que vira a etapa; as outras fecham como duplicadas dela; em grupo com `bug`, o `bug` de maior severidade e, no empate, o de menor número)
  Pergunta: #a, #b, #c — <pergunta autossuficiente> | Cabeçalho: <até 12 caracteres>
    - <opção recomendada> (Recomendado): <consequência>
    - <outra opção>: <consequência>
SOZINHAS: #e, #f (cada uma vira a sua própria etapa)
BLOQUEADAS: #g — <motivo>
ESFORÇO HIGH: G1 — <motivo>; #e — <motivo>   (ou "ESFORÇO HIGH: nenhuma")
ORDEM: <ordem sugerida de implementação dos grupos e das sozinhas, com o porquê em uma linha cada>
```

Com o `AGRUPAMENTO`:

- uma pergunta por grupo, com as opções que o subagente deu, e no fim uma pergunta para as bloqueadas, com as opções "Pular (Recomendado)" e "Detalhar mesmo assim";
- a resposta do dono fecha os grupos. Uma opção "Outro" que muda um grupo vale como foi escrita. Se ela for ambígua, faça mais uma pergunta;
- guarde a `ORDEM` para o resumo final e o `ESFORÇO HIGH` para o passo 3. Se o dono desfez ou mudou um grupo, reavalie o esforço das unidades que resultaram, pelos critérios.

Sem agrupamento (`sem-agrupar` ou uma candidata só), leia o corpo de cada candidata (`issue_read`) e aplique você mesmo os critérios de "Esforço do detalhamento".

O término do subagente acorda o coordenador, que lê o relatório na notificação. Vale a conferência de reserva de "4. Durante". Se o agrupamento ficar sem notícia por 3 h, pergunte ao dono se segue sem agrupar ("Seguir sem agrupar (Recomendado)" / "Recriar o subagente").

## 3. Detalhamento (subagentes Opus, `paralelo` por vez)

Cada **unidade** é um grupo aprovado ou uma issue sozinha. Todas rodam em subagentes; o esforço de cada uma (`high` ou `medium`) vem do `ESFORÇO HIGH` do agrupamento, dos critérios e do `alto=` (se o dono desfez ou mudou um grupo, reavalie).

### Subagentes

Siga a `ORDEM`. A dependência não segura o detalhamento: o `Depende de` ordena a implementação, e duas unidades que dependem uma da outra podem ser detalhadas ao mesmo tempo. Só espere a outra ficar pronta quando o plano de uma precisa do plano da outra (por exemplo, para usar um auxiliar que a outra cria). Crie até `paralelo` subagentes com a ferramenta `Agent` (`subagent_type: general-purpose`, `model: opus`, `run_in_background: true`, `effort: high` ou `medium` da unidade, `description` "Detalhamento — #<principal> <título curto>"). Quando um termina, o próximo começa. Guarde o id de cada subagente: as `RESPOSTAS` voltam por ele.

Mensagem:

```text
Você é um subagente do coordenador: não pergunte nada ao dono, e o seu relatório final é a mensagem ao coordenador. Você é o agente de detalhamento <da issue #n | do grupo #a (principal), #b, #c> do `fabianofranca/mapping` (docs/PROCESS.md, "Detalhar uma etapa" e "Fluxo automatizado", item 2). Não use a ferramenta de perguntas. Não crie branch, commit nem PR: o detalhamento só mexe em issues ("Nenhum PR existe só para mexer em plano").

1. Leia o `CLAUDE.md`, o `docs/PROCESS.md`, as issues da unidade com os comentários, as que elas citam e os títulos das `ready` e `in-progress` abertas, para achar sobreposição. Leia o código e os docs que o plano vai tocar: o "Toca em:" de cada fase cita arquivos que existem.
<Só em grupo: 2. O grupo foi aprovado pelo dono: <decisão, com as palavras do dono se ele escreveu>. A #a vira a etapa. O conteúdo de cada outra entra no corpo como item numerado, com a origem, o rótulo e a severidade ou o impacto. As outras fecham como duplicadas da #a (`state_reason: duplicate`, `duplicate_of`), cada uma com um comentário que diz para onde foi. Grupo com algum `bug`: a etapa é `bug`, com a maior severidade do grupo e sem `impact:`; se um absorvido tem severidade maior que a da principal, troque o `severity:` dela e diga por quê no comentário; o impacto de cada `roadmap` absorvida fica em "Absorvidas". Grupo sem `bug`: a etapa fica com o tipo e o rótulo da #a. Em "Absorvidas", o corpo lista a severidade ou o impacto de cada uma. Um `bug` absorvido mantém os passos para reproduzir e a evidência. <Se o grupo traz uma `ready`: o plano dela muda; diga isso num comentário nela, com o porquê e a decisão do dono. Sub-issues `step` abertas: (a) de uma `ready` absorvida, a fase que continua no plano novo passa para a principal (`sub_issue_write` `add` com `replace_parent: true`) e tem o corpo atualizado, e a que sai fecha `not_planned` com um comentário que aponta a principal; (b) de uma `ready` principal cujo plano muda, a fase que continua tem o corpo atualizado, a que sai fecha `not_planned` com o comentário, e as novas são criadas e postas na ordem (`sub_issue_write` `reprioritize`). No fim, nenhuma `step` aberta fica pendurada numa issue fechada.>>
3. Rascunhe o plano inteiro antes de criar qualquer coisa: objetivo, o que fica fora, decisões numeradas, épico (`epic/<nome>`), versões (schema, formatos e MCP: **uma** versão do MCP para a etapa toda, escrita como o tipo da subida — `MCP: minor`, `MCP: patch` ou `MCP: sem mudança` — e nunca como número, porque outras etapas detalhadas em paralelo pegariam o mesmo; o número é escolhido no fechamento do épico, na próxima versão livre da `origin/main`), registros (changelog e DS), a linha `Impacto:` (ou a severidade) e a tabela de modelos e esforço (linha Orquestrador, uma linha por fase e a coluna Testador). Para cada fase: a linha da tabela, o "Toca em:", os checkboxes e o aceite. A última fase traz a seção **Testador**, com os roteiros e a linha "Passada visual: <lista>" (ou "nenhuma"). Com várias issues, junte os roteiros numa rodada só.
   Antes de seguir, confira o rascunho contra o código da `main` (Grep e Read), item por item, e corrija o que não bater:
   - todo arquivo, função, teste, passo do `docs/TESTING.md` e versão citada existe e diz o que o plano afirma (os valores atuais de schema, `formatVersion`, MCP e `version` das bibliotecas, lidos no código);
   - nenhuma decisão admite duas implementações razoáveis diferentes; o que admitir vira decisão numerada ou pergunta ao dono;
   - cada fase cabe numa sessão (um PR revisável) e nenhuma depende de uma posterior;
   - roteiro novo é "o próximo número livre", entra num bloco da rodada completa (`docs/TESTING-NUVEM.md`) e o testador da nuvem consegue executá-lo sozinho;
   - a "Sobreposição" cita as `ready` e `in-progress` que mexem nos mesmos arquivos, roteiros ou versões, com o estado atual delas (não o de quando foram citadas).
4. Acrescente no corpo a linha `**Depende de:** #x, #y` (ou `**Depende de:** nenhuma`): a etapa ou o que precisa estar na `main` antes de ela começar. O skill que implementa as etapas em sequência lê essa linha. Ela é **obrigatória** sobre cada `ready` ou `in-progress` aberta cujo "Toca em:" tem arquivo em comum com o do plano novo: a etapa nova depende da que já existe. Não contam os registros de cada épico (`changelog/<nome>.md`, `docs/design-system/<nome>.md`) nem `mcp/version.ts`. Se a ordem do dono for outra, pergunte ao dono (passo 5); não edite a outra issue.
   Toda issue que você criar (o que separar em `roadmap` ou `bug`) leva no corpo a linha `Origem: etapa #<n>` (a etapa que você detalha).
5. Decisão de produto (docs/PROCESS.md: o esperado não está em issue, doc nem spec; há mais de uma leitura razoável; muda uma decisão já tomada; mexe em schema ou formato): não decida sozinho. Junte as perguntas num relatório final, neste formato, e termine. A resposta chega depois, como uma mensagem "RESPOSTAS #<principal>", e você retoma daí, com o contexto que já tem.

PERGUNTAS #<principal>
P1. #<principal> — <pergunta autossuficiente, com o contexto que o dono precisa> | Cabeçalho: <até 12 caracteres>
  - <opção recomendada> (Recomendado): <consequência>
  - <outra opção>: <consequência>
(de 2 a 4 opções, a recomendada primeiro; até 4 perguntas por mensagem; com mais, mande em rodadas)

   Decisão pequena você toma, segue e registra como decisão numerada. Não crie nada no GitHub antes das respostas.
6. Antes de criar, confira se uma tentativa anterior já criou sub-issues `step` ou trocou rótulos nesta unidade; complete o que falta, sem duplicar. Com as respostas: edite o corpo da issue principal com o plano, crie cada fase como sub-issue `step` (`issue_write` e depois `sub_issue_write` com a principal como pai), na ordem, troque `roadmap` por `ready` (o `issue_write` com `labels` substitui todos os rótulos da issue: leia os atuais e envie a lista completa, sem `roadmap` e com `ready`, e depois confira que `bug`, `severity:`, `impact:` e `code-review` continuam; o `bug` e o `severity:` ficam; o `impact:` fica numa `roadmap` sem `bug` no grupo, e a etapa que é `bug` não o leva; uma `ready` que não é `bug` leva o `impact:`) e registre num comentário as decisões do dono, com a data e o porquê.
7. Todo texto que você escreve no GitHub termina com o rodapé de atribuição. Nunca escreva o número de um PR ou de uma issue que ainda não existe (o do PR do épico, por exemplo): diga "o PR do épico", e quem o abrir põe o número.
8. Ao terminar, termine com uma destas mensagens como relatório final:

PRONTA #<principal> — <link>
  Épico: epic/<nome> · Fases: <n> · MCP: <minor, patch ou "sem mudança"> · Schema: <v ou "sem mudança">
  Modelos: Orquestrador <modelo>; <fase: modelo/esforço>; Testador <modelo/esforço>
  Depende de: <#x ou nenhuma>
  Absorvidas: <#b, #c ou nenhuma>
  Decisões do dono aplicadas: <lista curta ou nenhuma>
  Sobreposição: <arquivos ou roteiros em comum com outras ready, ou nenhuma>
  Conferência: <o que a conferência do passo 3 corrigiu, ou "nada a corrigir">
  Issues novas: <o que você separou em roadmap ou bug, ou nenhuma>

BLOQUEADA #<principal> — <motivo>   (condição de entrada não cumprida; não comente na issue)
FALHOU #<principal> — <o que travou e o que ficou feito>

<Em paralelo com você: #x, #y. Se o seu plano tocar o mesmo que eles, diga em "Sobreposição"; não combine com eles sozinho.>
```

## 4. Durante

O término de um subagente acorda o coordenador, que lê o relatório na notificação. Para cada relatório:

- **`PERGUNTAS #n`**: notificação, depois `AskUserQuestion` com as perguntas como vieram. Responda ao **mesmo** subagente por `SendMessage` (`to` = o id dele) com `RESPOSTAS #n` e, para cada `Pk`, o rótulo escolhido e as notas do dono, ou o texto dele em "Outro". Se chegarem perguntas de dois subagentes juntas, faça uma chamada por issue.
- **`PRONTA #n`**: confira com `issue_read` que a issue tem `ready` e não tem `roadmap` (e que `bug`, `severity:`, `impact:` e `code-review` de antes continuam; o `issue_write` com `labels` substitui todos os rótulos, então a troca leva a lista completa), que as sub-issues `step` existem (`issue_read` das sub-issues) e, em grupo, que as absorvidas fecharam como duplicadas e não têm `step` aberta (nem as de uma `ready` absorvida), e que o relatório traz a linha `Conferência:`. Se faltar algo, mande ao subagente o que falta por `SendMessage` e espere de novo. Com tudo certo, compare a "Sobreposição" com as prontas já recebidas da rodada (que o subagente não vê): com arquivo em comum (mesma regra do passo 4 da mensagem) e nenhuma dependência entre elas, acrescente `Depende de` na que vem depois na `ORDEM`, desde que a dependência (direta ou transitiva, lendo o `Depende de` das duas e das que elas citam) não feche um ciclo; se fechar, não edite e pergunte ao dono (corpo editado e um comentário com o porquê, terminado com o rodapé de atribuição). Depois **arquive a sessão do subagente de detalhamento** (`archive_session`, com o id que a ferramenta devolveu, se for uma sessão; subagente `Agent` em segundo plano não tem o que arquivar) e anote isso para o resumo final. Depois, comece a próxima unidade.
- **`PERGUNTAS #n` respondidas e decisão registrada:** o mesmo vale para o agrupamento: depois de o dono decidir os grupos, arquive a sessão do subagente de agrupamento (`archive_session`) e anote no resumo final.
- **`BLOQUEADA #n`** ou **`FALHOU #n`**: anote e comece a próxima. Uma falha vai para o resumo final; não tente de novo sem perguntar ao dono.

**Se o `SendMessage` não alcançar o subagente** (sessão reiniciada, subagente perdido), crie um subagente novo com a mesma mensagem da unidade e, no fim dela, as `RESPOSTAS` já dadas. É seguro: o passo 5 da mensagem proíbe criar qualquer coisa no GitHub antes das respostas, e o passo 6 manda completar o que uma tentativa anterior deixou.

**Conferência de reserva:** uma só, de 60 min (`send_later`), enquanto houver subagente rodando sem relatório. Quando ela disparar:

- subagente sem notícia: agende de novo. Na terceira vez sem notícia do mesmo subagente (3 h), pergunte ao dono: "Seguir sem a #n (Recomendado)" / "Recriar o subagente" (o recriar segue o parágrafo acima);
- subagente esperando `RESPOSTAS` que o dono ainda não deu não é falha: `PushNotification` ("N unidades esperando suas respostas: #a, #b") e agende de novo.

Cancele (`delete_trigger`) a conferência quando não houver mais subagente sem relatório.

## 5. Resumo final

Quando todos os subagentes terminarem:

1. Responda no chat com uma tabela: unidade, issue com link, resultado (pronta, bloqueada ou falhou), esforço (`medium` ou `high`), épico, fases, versão do MCP e "Depende de". Depois, as sobreposições entre as etapas prontas, as issues novas que os subagentes criaram (elas **não** foram detalhadas nesta rodada), as unidades que ainda esperam resposta do dono e a ordem de implementação sugerida (a `ORDEM` do agrupamento, ajustada pelos "Depende de").
2. No resumo, diga também quais sessões de detalhamento e de agrupamento foram arquivadas.
3. Mande um `PushNotification` com o total ("Backlog detalhado: 5 prontas, 1 bloqueada").
