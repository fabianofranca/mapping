---
name: detalhar-backlog
description: Coordena sessões filhas Opus que detalham, como etapas `ready`, todas as issues abertas `roadmap` e `bug` do fabianofranca/mapping que ainda não estão `ready` nem `in-progress`. Antes de detalhar, uma sessão de agrupamento propõe juntar issues num épico só (menos versões pequenas do MCP, uma rodada do testador para várias) e o dono decide. As perguntas das filhas chegam ao dono sempre pelo seletor de perguntas, com uma opção recomendada. Use quando o dono pedir para detalhar o backlog, as roadmap, os bugs pendentes ou "tudo que não está ready", ou rodar /detalhar-backlog.
---

# Detalhar o backlog

Esta sessão é o **coordenador**. Ela não detalha nada sozinha: cria as sessões filhas, leva as perguntas delas ao dono, devolve as respostas e confere o resultado. Quem detalha segue o `CLAUDE.md` ("Detalhar uma etapa", "Impacto", "Bugs e evidência visual", "Uso de modelos" e "Fluxo automatizado", item 2).

Rode este chat no modo **Auto**: uma sessão filha que pede permissão fica parada, porque ninguém está olhando (`CLAUDE.md`, "Limitações"). O coordenador pode rodar em Sonnet; o julgamento fica com as filhas, que rodam em Opus.

`create_session` escolhe o modelo, não o esforço: a filha roda no esforço padrão da sessão. Para a unidade cujo detalhamento pede esforço **high** (ver "Esforço do detalhamento"), o coordenador recomenda ao dono abrir ele mesmo a sessão, em Opus e esforço high, e entrega o prompt pronto para colar.

## Argumentos

`/detalhar-backlog [#n ...] [paralelo=N] [sem-agrupar] [alto=#a,#b|nenhum]`

- `#n ...`: detalha só essas issues. Sem a lista, detalha todas as candidatas.
- `paralelo=N`: quantas filhas de detalhamento rodam ao mesmo tempo. O padrão é **3**.
- `sem-agrupar`: pula o agrupamento, e cada issue vira a sua própria etapa.
- `alto=#a,#b`: essas issues (ou os grupos que as contêm) pedem esforço high, além das que os critérios apontarem. `alto=nenhum`: nenhuma unidade é tratada como high, e todas vão para filhas.

## Regra das perguntas ao dono

Toda pergunta ao dono passa pela ferramenta de perguntas (`AskUserQuestion`), **nunca** por texto solto no chat:

- cada pergunta se sustenta sozinha, porque o dono pode ver só o diálogo: ela começa por `#<n> — ` e cita o que precisa da issue;
- tem de 2 a 4 opções, e a **recomendada** vem primeiro, com " (Recomendado)" no fim do rótulo;
- o cabeçalho tem no máximo 12 caracteres;
- vão no máximo 4 perguntas por chamada. Se houver mais, faça outra chamada, uma issue (ou grupo) por chamada sempre que der;
- a resposta em "Outro" e as notas do dono vão para a filha **sem mudar nenhuma palavra**.

Antes de cada chamada, mande um `PushNotification` curto, por exemplo "Detalhamento: 2 perguntas da #896". O dono usa o celular e pode não estar olhando o chat. Carregue o `PushNotification` com o `ToolSearch` se ainda não estiver carregado; o `AskUserQuestion` só se ele aparecer na lista de ferramentas adiadas.

## Esforço do detalhamento

O detalhamento de uma unidade pede esforço **high** quando o plano depende de julgamento fino, e um erro nele custa caro na implementação. Pede high a unidade que:

- mexe em schema, num formato (`docs/FORMAT.md`, `docs/SPEC-FORMAT.md`, `docs/COMMENT-FORMAT.md`) ou numa migração;
- toca a gravação ou a integridade do `mapping.json` (`src/store/session.ts`, revisão, conflito), perda de dados ou segurança (CSP, Trusted Types);
- mexe em regra de arquitetura transversal: o assentar da hierarquia (`src/model/hierarchySettle.ts`), o store e o desfazer, o `projectIndex`, o `CanvasController`, o contrato das tools do MCP;
- deve passar de umas 5 fases, ou junta 4 ou mais issues;
- inclui uma `ready` cujo plano muda (replanejamento), ou é uma rodada `code-review` com muitos achados a planejar.

O resto usa o esforço padrão. Na dúvida, recomende high (`CLAUDE.md`: na dúvida, vale o maior), com o motivo. O argumento `alto=` soma unidades ou desliga a regra.

## 1. Candidatas

1. `get_session` sem `session_id`: guarde o id desta sessão, que é o **Coordenador** das mensagens.
2. `list_issues` (`state: OPEN`, `fields: [number, title, labels]`, sem `body`, porque o corpo de todas passa do limite) uma vez com `labels: [roadmap]` e uma com `labels: [bug]`.
3. Fique só com as que **não** têm `ready`, `in-progress` nem `step`. Com a lista `#n ...`, use a interseção dela com as candidatas e diga quais números ficaram de fora e por quê.
4. Ordem: `severity: high` e `impact: high` primeiro, depois `medium`, depois `low`; no empate, o menor número vem antes. A ordem do Project "Mapping - Backlog" é do dono, e as ferramentas não alcançam o Project.
5. Issues do revisor de código (rótulo `code-review`, `CLAUDE.md` "Revisão de código"): a da rodada (`roadmap`, título "CR base …" ou "CR épico …") lista muitos achados, e cada defeito high ou medium dela já tem a sua issue `bug`, citada no corpo. O detalhamento da rodada cobre só os achados que **não** apontam para um `bug`. Passe isso à filha de agrupamento, para ela juntar cada `bug` com a rodada ou com outras candidatas da mesma área, ou separar a rodada por área, sem detalhar o mesmo achado duas vezes.
6. Sem candidatas, diga isso e termine.

## 2. Agrupamento (uma filha Opus)

Pule este passo com `sem-agrupar` ou com uma candidata só.

Crie **uma** sessão de agrupamento com `create_session`:

- `model`: o id do **Opus** mais recente que o seu prompt do sistema lista;
- `source_url`: `https://github.com/fabianofranca/mapping` e `source_revision`: `main`;
- título: "Agrupamento do backlog";
- nunca `permission_mode: plan`.

Mensagem:

```text
Você é o agente de agrupamento do backlog do `fabianofranca/mapping`. Ninguém está olhando esta sessão: não pergunte nada no chat e não use a ferramenta de perguntas. Não edite issue, não crie branch nem PR.

1. Leia o `CLAUDE.md`, as candidatas <lista #n — título — rótulos> (corpo e comentários) e as issues `ready` abertas (corpo; as sub-issues `step` só quando precisar). Não proponha mexer nas `in-progress`.
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
6. Mande a proposta ao coordenador por `send_message`, exatamente neste formato, e termine:

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

Coordenador: `<id do coordenador>`
```

Com o `AGRUPAMENTO`:

- uma pergunta por grupo, com as opções que a filha deu, e no fim uma pergunta para as bloqueadas, com as opções "Pular (Recomendado)" e "Detalhar mesmo assim";
- a resposta do dono fecha os grupos. Uma opção "Outro" que muda um grupo vale como foi escrita. Se ela for ambígua, faça mais uma pergunta;
- guarde a `ORDEM` para o resumo final e o `ESFORÇO HIGH` para o passo 3. Se o dono desfez ou mudou um grupo, reavalie o esforço das unidades que resultaram, pelos critérios.

Sem agrupamento (`sem-agrupar` ou uma candidata só), leia o corpo de cada candidata (`issue_read`) e aplique você mesmo os critérios de "Esforço do detalhamento".

Se a filha não responder em 45 min (`send_later`), leia `get_session` (`status_bucket`) e `list_events`. Se ela travou ou falhou, pergunte ao dono se segue sem agrupar ("Seguir sem agrupar (Recomendado)" / "Tentar de novo").

## 3. Detalhamento (filhas Opus, `paralelo` por vez)

Cada **unidade** é um grupo aprovado ou uma issue sozinha.

### Unidades em esforço high

Antes de criar as filhas, pergunte ao dono, com `AskUserQuestion`, como detalhar cada unidade marcada como high (até 4 por chamada; com `alto=nenhum`, pule):

- pergunta: "#<principal> — <título curto>: o detalhamento pede esforço high (<motivo>), e a sessão filha não escolhe o esforço. Como detalhar?"; cabeçalho: "Esforço";
- "Prompt para eu abrir (Recomendado)": você recebe o prompt pronto e abre uma sessão Opus em esforço high;
- "Filha no esforço padrão": vira uma filha como as outras;
- "Pular nesta rodada": a unidade fica fora e entra no resumo.

Para cada "Prompt para eu abrir", mande ao dono **uma mensagem por unidade**, todas logo depois da resposta, com uma linha de instrução e o prompt num bloco só, para ele copiar inteiro pelo celular. A instrução: "Abra uma sessão nova do Claude Code no `fabianofranca/mapping`, branch `main`, modelo Opus, esforço high, e cole:". O prompt leva preenchido tudo o que, na mensagem das filhas, só o coordenador sabe (a unidade, a decisão do grupo, quem roda em paralelo e o id do coordenador):

```text
Detalhe <a issue #n | o grupo #a (principal), #b, #c> do `fabianofranca/mapping` como etapa `ready`, nesta sessão. Siga a mensagem de detalhamento do skill `.claude/skills/detalhar-backlog/SKILL.md` (seção 3, o bloco de texto de "Filhas"), com os dados abaixo e estas diferenças:
- Eu estou olhando esta sessão. Não vale a frase de abertura "Ninguém está olhando esta sessão … as perguntas vão ao coordenador": no passo 5, as decisões de produto você me pergunta direto, pela ferramenta de perguntas, com as regras de "Regra das perguntas ao dono" do mesmo skill, e segue com as respostas sem esperar "RESPOSTAS".
- Antes de tudo, mande ao coordenador por `send_message` "INICIADA #<principal> — <id desta sessão>" (o id vem do `get_session` sem `session_id`). No fim, mande PRONTA, BLOQUEADA ou FALHOU como o passo 8 diz.
<Só em grupo: - O grupo foi aprovado por mim: <decisão, com as palavras do dono se ele escreveu>.>
<- Em paralelo com você: #x, #y.>

Coordenador: `<id do coordenador>`
```

A unidade com prompt não ocupa vaga do `paralelo`: as filhas seguem enquanto o dono abre a sessão. Agende uma conferência (`send_later`, 60 min) para cada prompt entregue: sem `INICIADA` até lá, mande um `PushNotification` ("Prompt da #n esperando você abrir a sessão") e agende mais uma vez; sem `INICIADA` na segunda, pergunte ao dono se cria a filha no esforço padrão ("Criar filha no padrão (Recomendado)" / "Vou abrir" / "Pular"). Se o dono disser no chat que não vai abrir, faça a mesma pergunta.

### Filhas

Siga a `ORDEM`. A dependência não segura o detalhamento: o `Depende de` ordena a implementação, e duas unidades que dependem uma da outra podem ser detalhadas ao mesmo tempo. Só espere a outra ficar pronta quando o plano de uma precisa do plano da outra (por exemplo, para usar um auxiliar que a outra cria). Crie até `paralelo` sessões com `create_session` (o mesmo `model`, `source_url` e `source_revision` do agrupamento, título "Detalhamento — #<principal> <título curto>"). Quando uma termina, a próxima começa.

Mensagem:

```text
Você é o agente de detalhamento <da issue #n | do grupo #a (principal), #b, #c> do `fabianofranca/mapping` (CLAUDE.md, "Detalhar uma etapa" e "Fluxo automatizado", item 2). Ninguém está olhando esta sessão: não pergunte nada no chat e não use a ferramenta de perguntas; as perguntas vão ao coordenador. Não crie branch, commit nem PR: o detalhamento só mexe em issues ("Nenhum PR existe só para mexer em plano").

1. Leia o `CLAUDE.md`, as issues da unidade com os comentários, as que elas citam e os títulos das `ready` e `in-progress` abertas, para achar sobreposição. Leia o código e os docs que o plano vai tocar: o "Toca em:" de cada fase cita arquivos que existem.
<Só em grupo: 2. O grupo foi aprovado pelo dono: <decisão, com as palavras do dono se ele escreveu>. A #a vira a etapa. O conteúdo de cada outra entra no corpo como item numerado, com a origem, o rótulo e a severidade ou o impacto. As outras fecham como duplicadas da #a (`state_reason: duplicate`, `duplicate_of`), cada uma com um comentário que diz para onde foi. Grupo com algum `bug`: a etapa é `bug`, com a maior severidade do grupo e sem `impact:`; se um absorvido tem severidade maior que a da principal, troque o `severity:` dela e diga por quê no comentário; o impacto de cada `roadmap` absorvida fica em "Absorvidas". Grupo sem `bug`: a etapa fica com o tipo e o rótulo da #a. Em "Absorvidas", o corpo lista a severidade ou o impacto de cada uma. Um `bug` absorvido mantém os passos para reproduzir e a evidência. <Se o grupo traz uma `ready`: o plano dela muda; diga isso num comentário nela, com o porquê e a decisão do dono. Sub-issues `step` abertas: (a) de uma `ready` absorvida, a fase que continua no plano novo passa para a principal (`sub_issue_write` `add` com `replace_parent: true`) e tem o corpo atualizado, e a que sai fecha `not_planned` com um comentário que aponta a principal; (b) de uma `ready` principal cujo plano muda, a fase que continua tem o corpo atualizado, a que sai fecha `not_planned` com o comentário, e as novas são criadas e postas na ordem (`sub_issue_write` `reprioritize`). No fim, nenhuma `step` aberta fica pendurada numa issue fechada.>>
3. Rascunhe o plano inteiro antes de criar qualquer coisa: objetivo, o que fica fora, decisões numeradas, épico (`epic/<nome>`), versões (schema, formatos e MCP: **uma** versão do MCP para a etapa toda, escrita como o tipo da subida — `MCP: minor`, `MCP: patch` ou `MCP: sem mudança` — e nunca como número, porque outras etapas detalhadas em paralelo pegariam o mesmo; o número é fixado quando o épico começa), registros (changelog e DS), a linha `Impacto:` (ou a severidade) e a tabela de modelos e esforço (linha Orquestrador, uma linha por fase e a coluna Testador). Para cada fase: a linha da tabela, o "Toca em:", os checkboxes e o aceite. A última fase traz a seção **Testador**, com os roteiros e a linha "Passada visual: <lista>" (ou "nenhuma"). Com várias issues, junte os roteiros numa rodada só.
   Antes de seguir, confira o rascunho contra o código da `main` (Grep e Read), item por item, e corrija o que não bater:
   - todo arquivo, função, teste, passo do `docs/TESTING.md` e versão citada existe e diz o que o plano afirma (os valores atuais de schema, `formatVersion`, MCP e `version` das bibliotecas, lidos no código);
   - nenhuma decisão admite duas implementações razoáveis diferentes; o que admitir vira decisão numerada ou pergunta ao dono;
   - cada fase cabe numa sessão (um PR revisável) e nenhuma depende de uma posterior;
   - roteiro novo é "o próximo número livre", entra num bloco da rodada completa (`docs/TESTING-NUVEM.md`) e o testador da nuvem consegue executá-lo sozinho;
   - a "Sobreposição" cita as `ready` e `in-progress` que mexem nos mesmos arquivos, roteiros ou versões, com o estado atual delas (não o de quando foram citadas).
4. Acrescente no corpo a linha `**Depende de:** #x, #y` (ou `**Depende de:** nenhuma`): a etapa ou o que precisa estar na `main` antes de ela começar. O skill que implementa as etapas em sequência lê essa linha.
5. Decisão de produto (CLAUDE.md: o esperado não está em issue, doc nem spec; há mais de uma leitura razoável; muda uma decisão já tomada; mexe em schema ou formato): não decida sozinho. Junte as perguntas numa mensagem ao coordenador, por `send_message`, neste formato, e termine o turno. A resposta chega como uma mensagem "RESPOSTAS #<principal>".

PERGUNTAS #<principal>
P1. #<principal> — <pergunta autossuficiente, com o contexto que o dono precisa> | Cabeçalho: <até 12 caracteres>
  - <opção recomendada> (Recomendado): <consequência>
  - <outra opção>: <consequência>
(de 2 a 4 opções, a recomendada primeiro; até 4 perguntas por mensagem; com mais, mande em rodadas)

   Decisão pequena você toma, segue e registra como decisão numerada. Não crie nada no GitHub antes das respostas.
6. Com as respostas: edite o corpo da issue principal com o plano, crie cada fase como sub-issue `step` (`issue_write` e depois `sub_issue_write` com a principal como pai), na ordem, troque `roadmap` por `ready` (o `bug` e o `severity:` ficam; o `impact:` fica numa `roadmap` sem `bug` no grupo, e a etapa que é `bug` não o leva; uma `ready` que não é `bug` leva o `impact:`) e registre num comentário as decisões do dono, com a data e o porquê.
7. Todo texto que você escreve no GitHub termina com o rodapé de atribuição. Nunca escreva o número de um PR ou de uma issue que ainda não existe (o do PR do épico, por exemplo): diga "o PR do épico", e quem o abrir põe o número.
8. Ao terminar, avise o coordenador por `send_message` com uma destas mensagens, e termine:

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

Coordenador: `<id do coordenador>`
```

## 4. Durante

Para cada mensagem que chega:

- **`INICIADA #n — <id>`**: o dono abriu a sessão do prompt. Cancele a conferência do prompt e agende a de reserva da sessão, como a de uma filha (abaixo). As perguntas dessa sessão vão direto ao dono, e não passam por você.
- **`PERGUNTAS #n`**: notificação, depois `AskUserQuestion` com as perguntas como vieram. Responda à filha por `send_message` com `RESPOSTAS #n` e, para cada `Pk`, o rótulo escolhido e as notas do dono, ou o texto dele em "Outro". Se chegarem perguntas de duas filhas juntas, faça uma chamada por issue.
- **`PRONTA #n`**: confira com `issue_read` que a issue tem `ready` e não tem `roadmap`, que as sub-issues `step` existem (`issue_read` das sub-issues) e, em grupo, que as absorvidas fecharam como duplicadas e não têm `step` aberta (nem as de uma `ready` absorvida), e que a mensagem traz a linha `Conferência:`. Se faltar algo, mande à filha o que falta e espere de novo. Com tudo certo, comece a próxima unidade.
- **`BLOQUEADA #n`** ou **`FALHOU #n`**: anote e comece a próxima. Uma falha vai para o resumo final; não tente de novo sem perguntar ao dono.

Para cada filha criada (e cada sessão de prompt que mandou `INICIADA`), agende uma conferência de reserva (`send_later`, 45 min). Se a filha não avisou até lá, leia `get_session` (`status_bucket`) e `list_events`:

- trabalhando: agende de novo;
- esperando as `RESPOSTAS` de perguntas que o dono ainda não respondeu (ou, na sessão de prompt, a resposta do dono no seletor dela): não é falha. Mande um `PushNotification` ("N filhas esperando suas respostas: #a, #b") e agende de novo;
- parada esperando permissão, falha ou sessão morta: pergunte ao dono ("Seguir sem a #n (Recomendado)" / "Criar a sessão de novo"), com o que os eventos mostram.

Cancele (`delete_trigger`) a conferência da filha que já avisou.

## 5. Resumo final

Quando todas as filhas e as sessões de prompt que mandaram `INICIADA` terminarem:

1. Responda no chat com uma tabela: unidade, issue com link, resultado (pronta, bloqueada, falhou ou pulada), esforço (padrão, ou high por prompt), épico, fases, versão do MCP e "Depende de". Depois, os prompts que o dono ainda não abriu (repita o bloco de cada um), as sobreposições entre as etapas prontas, as issues novas que as filhas criaram (elas **não** foram detalhadas nesta rodada), as filhas que ainda esperam resposta do dono e a ordem de implementação sugerida (a `ORDEM` do agrupamento, ajustada pelos "Depende de").
2. Mande um `PushNotification` com o total ("Backlog detalhado: 5 prontas, 1 bloqueada").
3. Pergunte se arquiva as sessões filhas: "Arquivar (Recomendado)" / "Manter".
