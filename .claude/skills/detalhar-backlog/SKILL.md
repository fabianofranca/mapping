---
name: detalhar-backlog
description: Coordena sessões filhas Opus que detalham, como etapas `ready`, todas as issues abertas `roadmap` e `bug` do fabianofranca/mapping que ainda não estão `ready` nem `in-progress`. Antes de detalhar, uma sessão de agrupamento propõe juntar issues num épico só (menos versões pequenas do MCP, uma rodada do testador para várias) e o dono decide. As perguntas das filhas chegam ao dono sempre pelo seletor de perguntas, com uma opção recomendada. Use quando o dono pedir para detalhar o backlog, as roadmap, os bugs pendentes ou "tudo que não está ready", ou rodar /detalhar-backlog.
---

# Detalhar o backlog

Esta sessão é o **coordenador**. Ela não detalha nada sozinha: cria as sessões filhas, leva as perguntas delas ao dono, devolve as respostas e confere o resultado. Quem detalha segue o `CLAUDE.md` ("Detalhar uma etapa", "Impacto", "Bugs e evidência visual", "Uso de modelos" e "Fluxo automatizado", item 2).

Rode este chat no modo **Auto**: uma sessão filha que pede permissão fica parada, porque ninguém está olhando (`CLAUDE.md`, "Limitações"). O coordenador pode rodar em Sonnet; o julgamento fica com as filhas, que rodam em Opus.

## Argumentos

`/detalhar-backlog [#n ...] [paralelo=N] [sem-agrupar]`

- `#n ...`: detalha só essas issues. Sem a lista, detalha todas as candidatas.
- `paralelo=N`: quantas filhas de detalhamento rodam ao mesmo tempo. O padrão é **3**.
- `sem-agrupar`: pula o agrupamento, e cada issue vira a sua própria etapa.

## Regra das perguntas ao dono

Toda pergunta ao dono passa pela ferramenta de perguntas (`AskUserQuestion`), **nunca** por texto solto no chat:

- cada pergunta se sustenta sozinha, porque o dono pode ver só o diálogo: ela começa por `#<n> — ` e cita o que precisa da issue;
- tem de 2 a 4 opções, e a **recomendada** vem primeiro, com " (Recomendado)" no fim do rótulo;
- o cabeçalho tem no máximo 12 caracteres;
- vão no máximo 4 perguntas por chamada. Se houver mais, faça outra chamada, uma issue (ou grupo) por chamada sempre que der;
- a resposta em "Outro" e as notas do dono vão para a filha **sem mudar nenhuma palavra**.

Antes de cada chamada, mande um `PushNotification` curto, por exemplo "Detalhamento: 2 perguntas da #896". O dono usa o celular e pode não estar olhando o chat. Carregue `AskUserQuestion` e `PushNotification` com o `ToolSearch` se ainda não estiverem carregadas.

## 1. Candidatas

1. `get_session` sem `session_id`: guarde o id desta sessão, que é o **Coordenador** das mensagens.
2. `list_issues` (`state: OPEN`, `fields: [number, title, labels]`, sem `body`, porque o corpo de todas passa do limite) uma vez com `labels: [roadmap]` e uma com `labels: [bug]`.
3. Fique só com as que **não** têm `ready`, `in-progress` nem `step`. Com a lista `#n ...`, use a interseção dela com as candidatas e diga quais números ficaram de fora e por quê.
4. Ordem: `severity: high` e `impact: high` primeiro, depois `medium`, depois `low`; no empate, o menor número vem antes. A ordem do Project "Mapping - Backlog" é do dono, e as ferramentas não alcançam o Project.
5. Sem candidatas, diga isso e termine.

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
2. Proponha grupos: candidatas que valem mais num épico só do que em épicos separados. Pese:
   - versão do MCP: várias etapas que subiriam o MCP cada uma (minor ou patch) viram uma versão só;
   - rodada do testador: roteiros iguais ou próximos rodam numa rodada só (`docs/TESTING-NUVEM.md`);
   - mesma área, os mesmos arquivos ou a mesma ordem proposta: menos conflito e menos merge da `main` no épico;
   - mesmo formato ou schema: uma subida de versão e uma migração só;
   - o custo de juntar: o épico grande demora mais a chegar à `main` e uma falha segura todo mundo. Recomende no máximo umas 8 fases por épico e não junte o que tem condição de entrada não cumprida.
3. Diga também quais issues `ready` (não `in-progress`) entrariam bem num grupo. Juntar uma `ready` muda um plano já fechado, e isso é do dono: proponha, não decida.
4. Marque como bloqueada a candidata com condição de entrada não cumprida (dependência externa, decisão anterior pendente), com o motivo.
5. Mande a proposta ao coordenador por `send_message`, exatamente neste formato, e termine:

AGRUPAMENTO
G1. <nome curto> — #a, #b, #c<, + ready #d>
  Por quê: <versões e rodada que economiza, área comum, riscos>
  Principal: #a (a que vira a etapa; as outras fecham como duplicadas dela)
  Pergunta: #a, #b, #c — <pergunta autossuficiente> | Cabeçalho: <até 12 caracteres>
    - <opção recomendada> (Recomendado): <consequência>
    - <outra opção>: <consequência>
SOZINHAS: #e, #f (cada uma vira a sua própria etapa)
BLOQUEADAS: #g — <motivo>
ORDEM: <ordem sugerida de implementação dos grupos e das sozinhas, com o porquê em uma linha cada>

Coordenador: `<id do coordenador>`
```

Com o `AGRUPAMENTO`:

- uma pergunta por grupo, com as opções que a filha deu, e no fim uma pergunta para as bloqueadas, com as opções "Pular (Recomendado)" e "Detalhar mesmo assim";
- a resposta do dono fecha os grupos. Uma opção "Outro" que muda um grupo vale como foi escrita. Se ela for ambígua, faça mais uma pergunta;
- guarde a `ORDEM` para o resumo final.

Se a filha não responder em 45 min (`send_later`), leia `get_session` (`status_bucket`) e `list_events`. Se ela travou ou falhou, pergunte ao dono se segue sem agrupar ("Seguir sem agrupar (Recomendado)" / "Tentar de novo").

## 3. Detalhamento (filhas Opus, `paralelo` por vez)

Cada **unidade** é um grupo aprovado ou uma issue sozinha. Siga a `ORDEM`. Se uma unidade depende de outra (a filha disse que depende, ou o corpo diz "depois da #X"), ela só começa depois que a outra estiver pronta. Crie até `paralelo` sessões com `create_session` (o mesmo `model`, `source_url` e `source_revision` do agrupamento, título "Detalhamento — #<principal> <título curto>"). Quando uma termina, a próxima começa.

Mensagem:

```text
Você é o agente de detalhamento <da issue #n | do grupo #a (principal), #b, #c> do `fabianofranca/mapping` (CLAUDE.md, "Detalhar uma etapa" e "Fluxo automatizado", item 2). Ninguém está olhando esta sessão: não pergunte nada no chat e não use a ferramenta de perguntas; as perguntas vão ao coordenador. Não crie branch, commit nem PR: o detalhamento só mexe em issues ("Nenhum PR existe só para mexer em plano").

1. Leia o `CLAUDE.md`, as issues da unidade com os comentários, as que elas citam e os títulos das `ready` e `in-progress` abertas, para achar sobreposição. Leia o código e os docs que o plano vai tocar: o "Toca em:" de cada fase cita arquivos que existem.
<Só em grupo: 2. O grupo foi aprovado pelo dono: <decisão, com as palavras do dono se ele escreveu>. A #a vira a etapa. O conteúdo de cada outra entra no corpo como item numerado, com a origem, o rótulo e a severidade ou o impacto. As outras fecham como duplicadas da #a (`state_reason: duplicate`, `duplicate_of`), cada uma com um comentário que diz para onde foi. A etapa fica com o tipo e o rótulo da #a; em "Absorvidas", o corpo lista a severidade ou o impacto de cada uma. Um `bug` absorvido mantém os passos para reproduzir e a evidência. <Se o grupo traz uma `ready`: o plano dela muda; diga isso num comentário nela, com o porquê e a decisão do dono.>>
3. Rascunhe o plano inteiro antes de criar qualquer coisa: objetivo, o que fica fora, decisões numeradas, épico (`epic/<nome>`), versões (schema, formatos e MCP: **uma** versão do MCP para a etapa toda), registros (changelog e DS), a linha `Impacto:` (ou a severidade) e a tabela de modelos e esforço (linha Orquestrador, uma linha por fase e a coluna Testador). Para cada fase: a linha da tabela, o "Toca em:", os checkboxes e o aceite. A última fase traz a seção **Testador**, com os roteiros e a linha "Passada visual: <lista>" (ou "nenhuma"). Com várias issues, junte os roteiros numa rodada só.
4. Acrescente no corpo a linha `**Depende de:** #x, #y` (ou `**Depende de:** nenhuma`): a etapa ou o que precisa estar na `main` antes de ela começar. O skill que implementa as etapas em sequência lê essa linha.
5. Decisão de produto (CLAUDE.md: o esperado não está em issue, doc nem spec; há mais de uma leitura razoável; muda uma decisão já tomada; mexe em schema ou formato): não decida sozinho. Junte as perguntas numa mensagem ao coordenador, por `send_message`, neste formato, e termine o turno. A resposta chega como uma mensagem "RESPOSTAS #<principal>".

PERGUNTAS #<principal>
P1. #<principal> — <pergunta autossuficiente, com o contexto que o dono precisa> | Cabeçalho: <até 12 caracteres>
  - <opção recomendada> (Recomendado): <consequência>
  - <outra opção>: <consequência>
(de 2 a 4 opções, a recomendada primeiro; até 4 perguntas por mensagem; com mais, mande em rodadas)

   Decisão pequena você toma, segue e registra como decisão numerada. Não crie nada no GitHub antes das respostas.
6. Com as respostas: edite o corpo da issue principal com o plano, crie cada fase como sub-issue `step` (`issue_write` e depois `sub_issue_write` com a principal como pai), na ordem, troque `roadmap` por `ready` (o `bug`, o `severity:` e o `impact:` ficam; uma `ready` que não é `bug` leva o `impact:`) e registre num comentário as decisões do dono, com a data e o porquê.
7. Todo texto que você escreve no GitHub termina com o rodapé de atribuição.
8. Ao terminar, avise o coordenador por `send_message` com uma destas mensagens, e termine:

PRONTA #<principal> — <link>
  Épico: epic/<nome> · Fases: <n> · MCP: <versão ou "sem mudança"> · Schema: <v ou "sem mudança">
  Modelos: Orquestrador <modelo>; <fase: modelo/esforço>; Testador <modelo/esforço>
  Depende de: <#x ou nenhuma>
  Absorvidas: <#b, #c ou nenhuma>
  Decisões do dono aplicadas: <lista curta ou nenhuma>
  Sobreposição: <arquivos ou roteiros em comum com outras ready, ou nenhuma>
  Issues novas: <o que você separou em roadmap ou bug, ou nenhuma>

BLOQUEADA #<principal> — <motivo>   (condição de entrada não cumprida; não comente na issue)
FALHOU #<principal> — <o que travou e o que ficou feito>

<Em paralelo com você: #x, #y. Se o seu plano tocar o mesmo que eles, diga em "Sobreposição"; não combine com eles sozinho.>

Coordenador: `<id do coordenador>`
```

## 4. Durante

Para cada mensagem que chega:

- **`PERGUNTAS #n`**: notificação, depois `AskUserQuestion` com as perguntas como vieram. Responda à filha por `send_message` com `RESPOSTAS #n` e, para cada `Pk`, o rótulo escolhido e as notas do dono, ou o texto dele em "Outro". Se chegarem perguntas de duas filhas juntas, faça uma chamada por issue.
- **`PRONTA #n`**: confira com `issue_read` que a issue tem `ready` e não tem `roadmap`, que as sub-issues `step` existem (`issue_read` das sub-issues) e, em grupo, que as absorvidas fecharam como duplicadas. Se faltar algo, mande à filha o que falta e espere de novo. Com tudo certo, comece a próxima unidade.
- **`BLOQUEADA #n`** ou **`FALHOU #n`**: anote e comece a próxima. Uma falha vai para o resumo final; não tente de novo sem perguntar ao dono.

Para cada filha criada, agende uma conferência de reserva (`send_later`, 45 min). Se a filha não avisou até lá, leia `get_session` (`status_bucket`) e `list_events`:

- trabalhando: agende de novo;
- parada esperando permissão, falha ou sessão morta: pergunte ao dono ("Seguir sem a #n (Recomendado)" / "Criar a sessão de novo"), com o que os eventos mostram.

Cancele (`delete_trigger`) a conferência da filha que já avisou.

## 5. Resumo final

Quando todas as unidades terminarem:

1. Responda no chat com uma tabela: unidade, issue com link, resultado (pronta, bloqueada ou falhou), épico, fases, versão do MCP e "Depende de". Depois, as sobreposições entre as etapas prontas, as issues novas que as filhas criaram (elas **não** foram detalhadas nesta rodada) e a ordem de implementação sugerida (a `ORDEM` do agrupamento, ajustada pelos "Depende de").
2. Mande um `PushNotification` com o total ("Backlog detalhado: 5 prontas, 1 bloqueada").
3. Pergunte se arquiva as sessões filhas: "Arquivar (Recomendado)" / "Manter".
