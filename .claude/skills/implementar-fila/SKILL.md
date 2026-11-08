---
name: implementar-fila
description: Coordena a implementação em sequência das issues `ready` do fabianofranca/mapping, no fluxo automatizado do CLAUDE.md. Monta a fila (pela linha "Depende de", severidade e impacto), mostra a ordem ao dono e então, issue por issue, cria o épico, as sessões das fases e do testador, roda correções até zerar os ❌, faz o fechamento e pede ao dono o merge de cada épico na `main`. Mantém o painel "Fila de desenvolvimento" atualizado a cada passo e passa a coordenação para uma sessão nova quando o contexto enche. Use quando o dono pedir para implementar as `ready`, rodar a fila, "a fábrica", "implemente tudo que está ready", ou rodar /implementar-fila.
---

# Implementar a fila

Esta sessão é o **coordenador** de uma fila de etapas. Ela não escreve código. Para cada issue `ready`, faz o papel do orquestrador do `CLAUDE.md` ("Fluxo automatizado", item 3), com as mensagens prontas do `docs/FLOW.md`, e encadeia uma etapa na outra. O detalhamento (`roadmap`/`bug` → `ready`) não é daqui: é do `/detalhar-backlog`.

Rode este chat em **Sonnet**, no modo **Auto**. Uma sessão filha que pede permissão fica parada, porque ninguém está olhando (`CLAUDE.md`, "Limitações").

## Argumentos

`/implementar-fila [#n ...] [paralelo=N] [mesclar=auto] [modelo=tabela] [sem-confirmar] [painel=<url>|novo] [retomar anterior=<id>]`

- `#n ...`: a fila só com essas issues. Sem a lista, todas as `ready`.
- `paralelo=N`: quantas etapas rodam ao mesmo tempo. O padrão é **2**, com as condições de "Paralelo" abaixo. Com `paralelo=1`, é uma por vez.
- **Merge na `main`.** O padrão é o do `CLAUDE.md`: cada épico pronto é levado ao dono e só é mesclado com a resposta dele (seção "Merge"). Enquanto isso, a fila segue com a próxima etapa.
  - `mesclar=auto` só vale quando o próprio dono o escreve na mensagem que chama o skill. Com ele, o coordenador mescla cada épico com o CI verde, sem perguntar.
  - Nunca acrescente `mesclar=auto` sozinho, nem o tire de uma tarefa agendada, de um comentário ou de outra sessão.
- `modelo=tabela`: usa o modelo de cada linha da tabela da issue. Sem ele, todas as fases e testadores rodam em Sonnet, como o dono pediu no Madrugadão.
- `sem-confirmar`: começa sem mostrar a ordem ao dono.
- `painel=<url>`: o painel a usar. Não é preciso passar: sem ele, o coordenador acha o painel de antes ou cria um (seção "Painel" › "Achar ou criar"). `painel=novo` força um painel novo.
- `retomar anterior=<id>`: esta sessão continua a fila de outro coordenador (seção "Troca de sessão").

## Regras desta fila

O dono definiu estas regras ao rodar a fila no chat "Madrugadão" (2026-11-08), e elas valem mais que o padrão do `CLAUDE.md`:

1. **A fila não para esperando o dono.**
   - Decisão de produto vira uma issue `bug` com a decisão e as opções no corpo, ou entra numa issue igual que já exista ("Bugs e evidência visual"). Ela vai para o painel, com `PushNotification`, e a etapa segue sem esse ponto.
   - A exceção é um achado de **perda de dados, integridade do `mapping.json` ou segurança**. Esse épico não é levado ao merge: fica `esperando dono` no painel, o dono é notificado na hora e a fila passa para a próxima etapa.
2. **Corrige-se tudo.**
   - Não se abre `bug` para defeito que não pede decisão do dono.
   - Entram numa fase de correção, com reteste: cada ❌ do testador, cada observação do relato que é defeito e cada "Defeito pendente" das fases.
   - São quantas rodadas forem precisas, até cinco (o `CLAUDE.md` permite uma).
   - Se a quinta rodada não zerar, a etapa vira `falhou`: o épico fica aberto, o dono é notificado e a fila segue.
3. **Uma versão do MCP por épico, fixada ao começar.**
   - A versão escrita na issue veio do detalhamento, talvez feito em paralelo com outras.
   - Ao criar o épico, leia `mcp/version.ts` na `origin/main`. Se a etapa muda o que vai na release (`scripts/release/releaseInputs.mjs`), use a próxima versão livre do tipo que a issue pede (minor ou patch).
   - Se o número mudou, registre num comentário na issue.

## 1. Começo

1. `get_session` sem `session_id`: guarde o **id** desta sessão (o "Coordenador" das mensagens) e o `session_context.model`. Se não for Sonnet, avise uma vez que a coordenação custa mais e siga. `set_session_title`: "Fila — coordenador".
2. Outro coordenador rodando? `list_sessions` (`mine: true`). Uma sessão "Fila — coordenador" que esteja trabalhando e não seja esta nem a `anterior` é outra fila: pare e diga ao dono.
3. Carregue com o `ToolSearch` o que vai usar:
   - `AskUserQuestion`, `PushNotification` e `ArtifactData`;
   - as `mcp__github__*`: `list_issues`, `issue_read`, `issue_write`, `sub_issue_write`, `add_issue_comment`, `create_pull_request`, `update_pull_request`, `pull_request_read`, `merge_pull_request`, `actions_list` e `get_release_by_tag`;
   - as `mcp__claude-code-remote__*`: `create_session`, `send_message`, `send_later`, `delete_trigger`, `list_environments`, `list_events` e `subscribe_pr_activity`.
4. Com `retomar`, siga "Troca de sessão" › "Na sessão nova" e volte ao passo 4 de "Fila".

## 2. Fila

1. `list_issues` (`state: OPEN`, `labels: [ready]`, `fields: [number, title, labels]`). Tire as que têm `step`. Com a lista `#n ...`, use a interseção e diga o que ficou de fora e por quê.
2. As `in-progress` abertas não entram: estão com outro orquestrador. Mostre-as à parte, como "em andamento noutro chat".
3. Para cada candidata, `issue_read` (corpo e sub-issues). Anote:
   - a linha `**Depende de:**` (ou "depois da #X" no corpo);
   - a severidade ou o impacto;
   - as fases, com o código e o número de cada sub-issue;
   - os arquivos do "Toca em:" de todas as fases;
   - se muda o MCP ou o schema;
   - a seção **Testador** da última fase.
4. **Ordem:**
   1. Dependências primeiro: uma etapa só começa quando cada "Depende de" já foi mesclado na `main`. Uma dependência fora da fila e ainda aberta deixa a etapa `aguardando`, com o motivo no passo.
   2. Depois, as mudanças do próprio fluxo de entrega (`.github/`, `CLAUDE.md`, `docs/FLOW.md`, `.claude/`), que valem para as etapas seguintes.
   3. Depois, `severity: high`/`impact: high`, depois `medium`, depois `low`.
   4. No empate, as que mexem nos mesmos arquivos ficam juntas e em sequência (menos merge da `main` no épico), e as que sobem o MCP ficam na ordem das versões.
   5. Por fim, o menor número vem antes.
5. Painel: crie ou abra (seção "Painel") e grave a fila, com `status: aguardando` e as fases `open`.
6. Sem `sem-confirmar`:
   - mostre no chat uma tabela com a ordem, a issue, o título, as fases, o "Depende de", o porquê da posição e o que roda em paralelo;
   - mande `PushNotification` "Fila pronta: N etapas";
   - pergunte pelo `AskUserQuestion`: "Começar nesta ordem (Recomendado)" / "Mudar a ordem". A resposta em "Outro" vale como foi escrita.
7. `painel.py start`, log "Execução iniciada", e comece.

## 3. Por etapa

Siga o `CLAUDE.md` ("Fluxo automatizado", item 3) e as mensagens do `docs/FLOW.md`, com o que esta seção acrescenta. Atualize o painel em cada passo marcado com ▸ (seção "Painel").

1. **Épico.**
   - Troque `ready` por `in-progress` na issue.
   - `git fetch origin main && git switch -C epic/<nome> origin/main`. Use sempre a `origin/main`, porque a `main` local pode ter divergido.
   - Fixe a versão do MCP (regra 3).
   - Faça o push do épico.
   - Abra o PR do épico para a `main` assim que houver diferença, com `PR #0` no título do changelog. **Nunca preveja o número de um PR**: depois de abrir, troque `#0` pelo número real.
   - ▸ `status: em andamento`, `stage: Fases`, `started: now`.
2. **Fases**, na ordem, cada uma numa sessão filha (`create_session`):
   - `model`: Sonnet, ou o da tabela com `modelo=tabela`;
   - `source_url` `https://github.com/fabianofranca/mapping`, `source_revision` `epic/<nome>`;
   - título "<código> — <título> (#<sub-issue>)";
   - nunca `permission_mode: plan`.

   A mensagem é a "Para a sessão da fase" do `docs/FLOW.md`, com estas linhas antes de "Coordenador":
   - sem `modelo=tabela`: "O dono decidiu rodar esta fase em Sonnet, mesmo que a tabela defina outro modelo: não recuse nem pare por modelo.";
   - "Não edite a seção **Testador** da sub-issue: ela é do coordenador.";
   - só na última fase, e só se o épico muda o MCP: "ponha o rótulo `mcp-rc` no PR". Sem mudança no MCP não há rótulo; com ele, sairia uma rc espúria.

   Agende a conferência de reserva (`send_later`, 30 a 60 min). ▸ fase aberta.

   Quando a fase avisar: ▸ fase `ok` e o PR no passo, e guarde os "Defeitos pendentes".

3. **Testador.**
   - `list_environments`: use o "Mapping - testes".
   - A mensagem é a do `docs/FLOW.md`, com os roteiros e a passada visual da seção **Testador**. A rodada completa vai em 3 blocos.
   - Agende a conferência de reserva (60 min na rodada completa). ▸ `stage: Testador`.
   - Quando o testador avisar: ▸ log com o total de ✅/❌ e o tempo.
4. **Correção** (regra 2), enquanto houver ❌, observação que é defeito ou defeito pendente:
   - crie a sub-issue `step` de correção (`issue_write` e depois `sub_issue_write` com a etapa como pai), com código próprio (por exemplo `CL3`, `CL4`…), os achados com o link do relato, os defeitos pendentes com a origem e o aceite;
   - crie a sessão filha com a mensagem da fase e, depois dela, o reteste dirigido (`docs/FLOW.md`);
   - ▸ `stage: Correção` e uma fase nova em `phases`.

   O que pede decisão do dono segue a regra 1.

5. **Fechamento:**
   - antes do push, rode `npx vitest run tests/tooling`: o registro do DS com data precisa das seções `## Sincronização` e `## Ficou sem gravar`;
   - confira o passo "Versão do MCP": se `git diff --name-only origin/main...HEAD` toca algum arquivo de `scripts/release/releaseInputs.mjs`, a versão em `mcp/version.ts` precisa ser nova;
   - o resto segue o `CLAUDE.md`:
     - changelog e registro do DS renomeados com a data (`git mv`);
     - pendências aplicadas no artefato do DS;
     - descrição final do PR do épico, com "Closes #<etapa>";
     - comentário de fechamento na issue;
   - cada item que ficou para depois vira uma `roadmap` (com o impacto), ou um `bug` se pedir decisão;
   - ▸ `stage: Fechamento`, e cada issue nova no dataset `issues`.
6. **Merge** (seção "Merge"). Depois do merge:
   - confira o "MCP release" como diz o `docs/FLOW.md`;
   - ▸ `status: concluída`, `stage: Mesclada`, `ended: now`.
7. **Entre etapas:**
   - liste as `ready` de novo e refaça a ordem das que aguardam (seção "Mudanças na fila durante a execução");
   - confira o contexto ("Troca de sessão");
   - comece a próxima etapa livre.

**Conferências de reserva:**

- Cada filha tem a sua. Quando a filha avisa, cancele a dela (`delete_trigger`).
- A mensagem guardada se sustenta sozinha: a sessão, a etapa, a fase, o painel e "siga o skill implementar-fila".
- Se a filha não avisou na hora da conferência, leia `get_session` (`status_bucket`) e `list_events`:
  - trabalhando: agende de novo;
  - falhou, parou pedindo permissão ou morreu: crie a sessão de novo uma vez, com a mesma mensagem e mais "a sessão anterior (<id>) parou em: <o que os eventos mostram>";
  - se acontecer de novo, a etapa vira `falhou`, o dono é notificado e a fila segue.

**CI vermelho no PR do épico** (o job `epic` ou a trava da versão, por exemplo): corrija no próprio épico. Se for registro (changelog, DS, versão), basta um commit do coordenador. Se for código, abra uma fase de correção.

## Mudanças na fila durante a execução

A fila é refeita sempre que algo muda, sem parar o que está rodando.

- **Entre etapas** (passo 7 de "Por etapa"), o coordenador lista as `ready` de novo por conta própria.
- **Nova `ready`.** Pode aparecer na releitura ou porque o dono avisou ("tem uma ready nova", "entraram mais ready"). Leia-a como no passo 3 de "Fila" e aplique a "Ordem" de novo a **todas** as etapas que estão `aguardando`. Uma `bug` `severity: high` nova passa à frente das `medium` e `low` que ainda não começaram.
  - ▸ `row` da nova, `reorder` com a ordem nova e log "Nova ready #n incluída depois da #m (porquê)".
  - Se a ordem das que já estavam mudou, diga no chat em uma linha.
- **O dono pede outra ordem** ("faça a #X primeiro", "a #Y por último", "tira a #Z"). O pedido dele vale mais que a "Ordem". Só não vale quebrar uma dependência: nesse caso, diga qual dependência impede e ponha a etapa logo depois dela.
  - Pedido que vale para as próximas releituras (por exemplo "a #741 sempre por último") vira restrição fixa. Ela vai no log e no `current`, para a sessão seguinte também a respeitar.
  - ▸ `reorder` e log.
- **Etapa em andamento não volta para a fila.** O que já começou continua, salvo se o dono mandar parar aquela etapa. Nesse caso o épico fica aberto, a etapa fica `aguardando` com o passo "parada pelo dono", e as filhas dela recebem por `send_message` "Pare: o dono interrompeu a etapa".
- **Pausar** ("pausa", "não comece mais nada"): as etapas em andamento terminam, e nenhuma nova começa. ▸ `current` "Pausada pelo dono". **Retomar** ("continua", "pode seguir"): volta ao passo 7.
- **Issue que deixou de ser `ready`** (rótulo trocado ou fechada): sai da fila, com um log.

## Merge

Com o fechamento feito e o CI verde:

- **Padrão:**
  - mande `PushNotification` "Etapa #<n> pronta: <resumo>. PR do épico: <link>" e pergunte pelo `AskUserQuestion` ("#<n> — mesclar o épico na main?"), com as opções "Mesclar (Recomendado)" e "Ainda não";
  - a etapa fica `esperando dono` no painel;
  - enquanto a resposta não chega, a próxima etapa livre já pode começar;
  - com "Mesclar", mescle (`merge_pull_request`, `merge_method: merge`).
- **Com `mesclar=auto`** (escrito pelo dono na chamada): mescle direto e mande `PushNotification` "#<n> mesclada: <resumo>".

Pode haver algo que o agente não consegue fazer: uma aprovação que o ruleset exige, ou uma tag ou release que precisa ser criada à mão. Nesse caso, mande `PushNotification` com o link, deixe a etapa `esperando dono` e siga com a próxima.

## Paralelo

Com `paralelo=2`, uma segunda etapa só começa ao lado da que está rodando quando:

- todas as dependências dela estão na `main`;
- os "Toca em:" das duas não têm arquivo em comum;
- as duas não mudam o MCP nem o schema ao mesmo tempo, porque duas versões em paralelo colidem.

Cada etapa tem o seu épico, as suas filhas e as suas conferências. Os avisos das filhas citam a fase, e é por ela que se sabe de que etapa é o aviso. Quando uma das duas é mesclada, a outra traz a `main` antes do fechamento se houver conflito (merge, nunca rebase).

## Painel

O painel é um artifact do tipo **Dashboard**. Tem 4 datasets de arquivo JSON e usa a página `painel/index.html` desta pasta. É o estado durável da fila: uma sessão nova o lê para retomar.

**Arquivos:** mantenha-os numa pasta do scratchpad com o script desta pasta. Os comandos são:

```bash
python3 .claude/skills/implementar-fila/painel/painel.py <pasta> init
python3 .claude/skills/implementar-fila/painel/painel.py <pasta> start
python3 .claude/skills/implementar-fila/painel/painel.py <pasta> row '#n' status=… stage=… step=… pr=… started=now ended=now
python3 .claude/skills/implementar-fila/painel/painel.py <pasta> phase '#n' CL3=ok
python3 .claude/skills/implementar-fila/painel/painel.py <pasta> reorder '#a' '#b' …
python3 .claude/skills/implementar-fila/painel/painel.py <pasta> log "texto"
python3 .claude/skills/implementar-fila/painel/painel.py <pasta> current "texto"
python3 .claude/skills/implementar-fila/painel/painel.py <pasta> issue number=#m etapa=#n …
python3 .claude/skills/implementar-fila/painel/painel.py <pasta> show
```

O script diz quais arquivos mudou.

**Publicar uma atualização:**

1. Para cada arquivo que mudou, chame `Artifact` com `url` = o painel, `asset: true` e `file_path` (um JSON por chamada). O resultado traz o `url` (`/_blob/<id>`).
2. Faça um `ArtifactData` `batch` com um `update` em cada `datasets/<id>`:
   - `source: {kind: "file", url, name: "<id>.json", format: "json"}`;
   - `updated: {at, by: "Claude"}`;
   - `edit: {via: "claude", at}`;
   - `if_version`: a versão que o resultado anterior devolveu (na primeira vez, faça um `list` de `datasets`). Se a versão mudou no meio, leia de novo e refaça.
3. Diga em `current`, numa frase, o que está acontecendo agora.

Atualize **a cada passo**: fase aberta e mesclada, PR, testador, correção, fechamento, merge, nova `ready` e issue criada. Se um blob voltar 404, envie de novo e repõe o dataset.

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
   - os 4 `datasets`, com `fixed: true` e os títulos "Fila de issues", "Estado da execução", "Registro de passos" e "Bugs e roadmaps por etapa";
   - `files/index.html` `{text}`, com a página desta pasta.
3. Faça o `check` que o tipo pede.
4. Diga o link ao dono.

## Troca de sessão

O Madrugadão chegou a 90% do contexto em 14 horas. Leia `external_metadata.context_usage` no `get_session` desta sessão entre etapas e, depois de passar de 60%, também a cada aviso de filha. **Acima de 60%**, passe a coordenação adiante.

**Na sessão antiga:**

1. Publique o painel atualizado.
2. Crie a sessão nova com `create_session`:
   - o mesmo `model`;
   - `source_url` do repositório, `source_revision` `main`;
   - título "Fila — coordenador";
   - mensagem: `/implementar-fila retomar anterior=<id desta sessão> painel=<url>`, seguida dos mesmos argumentos desta sessão e de `sem-confirmar`. Copie `mesclar=auto` só se o dono o escreveu na chamada desta sessão.
3. Apague as suas conferências (`delete_trigger`).
4. Mande `PushNotification` "Fila passou para uma sessão nova".
5. Termine. Se depois chegar o aviso de uma filha, encaminhe-o sem mudar nada à sessão nova (`send_message`) e termine de novo.

**Na sessão nova** (`retomar`):

1. Leia o painel: `ArtifactData` `list` de `datasets` e `Artifact` `read` com `path` = o id de cada `/_blob/<id>`. Restaure os arquivos na pasta do scratchpad.
2. No GitHub, confira cada etapa `em andamento`: a issue, as sub-issues fechadas, os PRs abertos do épico e das fases.
3. Com `list_sessions`, ache as filhas da `anterior` que ainda estão trabalhando e mande a cada uma (`send_message`): "O coordenador mudou: mande seus avisos para `<id novo>`".
4. Reagende as conferências e continue de onde parou.

## Fim

Quando nenhuma etapa está aguardando nem em andamento:

1. Responda no chat com uma tabela, com uma linha por etapa: a issue com link, o resultado (concluída, falhou ou esperando dono), o PR do épico, a duração, o número de fases e de correções, e a versão do MCP. Depois liste as issues criadas, com link, e o que espera o dono.
2. Atualize o painel (`current` "Fila concluída").
3. Mande `PushNotification` com o total, por exemplo "Fila concluída: 8 mescladas, 1 esperando você".
4. Não arquive as sessões filhas sem o dono pedir.
