---
name: implementar-fila
description: Coordena a implementação em sequência das issues `ready` do fabianofranca/mapping, no fluxo automatizado do docs/PROCESS.md. Monta a fila (pela linha "Depende de", severidade e impacto), mostra a ordem ao dono e então, issue por issue, cria o épico, as sessões das fases e do testador, roda correções até zerar os ❌, faz o fechamento e pede ao dono o merge de cada épico na `main`. Mantém o painel "Fila de desenvolvimento" atualizado, gasta pouco contexto (leituras pesadas por subagente, uma conferência por hora) e passa a coordenação para uma sessão nova quando o contexto enche. Use quando o dono pedir para implementar as `ready`, rodar a fila, "a fábrica", "implemente tudo que está ready", ou rodar /implementar-fila.
---

# Implementar a fila

Esta sessão é o **coordenador** de uma fila de etapas. Ela não escreve código. Para cada issue `ready`, faz o papel do orquestrador do `docs/PROCESS.md` ("Fluxo automatizado", item 3), com as mensagens prontas do `docs/FLOW.md`, e encadeia uma etapa na outra. O detalhamento (`roadmap`/`bug` → `ready`) não é daqui: é do `/detalhar-backlog`.

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
   - Decisão de produto vira uma issue `bug` com a decisão e as opções no corpo, ou entra numa issue igual que já exista ("Bugs e evidência visual"). Ela vai para o painel, com `PushNotification`, e a etapa segue sem esse ponto.
   - A exceção é um achado de **perda de dados, integridade do `mapping.json` ou segurança**. Esse épico não é levado ao merge: fica `esperando dono` no painel, o dono é notificado na hora e a fila passa para a próxima etapa.
2. **Corrige-se tudo.**
   - Não se abre `bug` para defeito que não pede decisão do dono.
   - Entram numa fase de correção, com reteste: cada ❌ do testador, cada observação do relato que é defeito e cada "Defeito pendente" das fases.
   - São quantas rodadas forem precisas, até cinco (o `docs/PROCESS.md` permite uma).
   - Se a quinta rodada não zerar, a etapa vira `falhou`: o épico fica aberto, o dono é notificado e a fila segue.
3. **Uma versão do MCP por épico, fixada ao começar.**
   - A versão escrita na issue veio do detalhamento, talvez feito em paralelo com outras.
   - Ao criar o épico, leia `mcp/version.ts` na `origin/main`. Se a etapa muda o que vai na release (`scripts/release/releaseInputs.mjs`), use a próxima versão livre do tipo que a issue pede (minor ou patch).
   - Se o número mudou, registre num comentário na issue.

## Economia de contexto

Um resultado grande de ferramenta não some do contexto: fica nele até o fim da sessão e é relido em cada turno seguinte. Um coordenador de 2026-11-09 chegou a ~417k tokens em 82 min, e o sucessor a 258k em 5 min (etapa #1285), quase tudo por leituras que o coordenador não precisava ter feito ele mesmo. Por isso:

1. **O coordenador não lê corpo de issue.** Nem `issue_read` `get` de etapa, nem `get_sub_issues`, nem `get_comments`. Quem lê é um subagente (ferramenta `Agent`, `model: "haiku"`), que devolve a **ficha** da etapa (modelo em "Ficha da etapa"). A ficha vai para o campo `plan` da linha da fila e é a fonte de tudo o que o coordenador precisa da issue até o fim, nesta sessão e nas seguintes.
2. **Leitura e escrita pesadas no GitHub vão por subagente**, que devolve uma linha: o estado do PR antes do merge, a conferência da Release do MCP e a criação da sub-issue de correção, com a leitura do relato do testador. O `sub_issue_write` e o `issue_write` com `parent_issue_number` devolvem a issue-pai inteira (~40k caracteres); `actions_list` devolve ~30k por chamada; `get_release_by_tag`, ~20k.
3. **Nunca `list_triggers`, `list_sessions` com limite alto, nem `list_events` sem `kinds` e `limit` pequenos.** Os ids que importam (filhas, conferência) ficam no painel.
4. **Uma conferência de reserva por sessão**, não uma por filha (seção "Conferências de reserva").
5. **Mensagens curtas para as filhas**: os valores e o nome da mensagem do `docs/FLOW.md`, não o texto inteiro copiado (passo 2 de "Por etapa").
6. **O JSON do painel nunca vai inteiro para o chat.** O `painel.py` imprime só `alterados: …`; para ver o estado, `show` (resumo) ou `show '#n'` (uma linha, com a ficha). Nada de `cat` dos arquivos.
7. **Um ciclo, uma publicação.** Cada aviso que chega é um ciclo: faça todos os passos dele, grave tudo no `painel.py` e publique o painel uma vez, no fim.
8. **Uma leitura por coisa.** O que já está no contexto (o aviso da filha, a ficha, o número do PR) não se lê de novo para conferir.

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
   4. No empate, as que mexem nos mesmos arquivos ficam juntas e em sequência (menos merge da `main` no épico), e as que sobem o MCP ficam na ordem das versões.
   5. Por fim, o menor número vem antes.
5. Painel: crie ou abra (seção "Painel") e grave a fila, com `status: aguardando` e as fases `open`.
6. Sem `sem-confirmar`:
   - mostre no chat uma tabela com a ordem, a issue, o título, as fases, o "Depende de", o porquê da posição e o que roda em paralelo;
   - mande `PushNotification` "Fila pronta: N etapas";
   - pergunte pelo `AskUserQuestion`: "Começar nesta ordem (Recomendado)" / "Mudar a ordem". A resposta em "Outro" vale como foi escrita.
7. `painel.py start`, log "Execução iniciada", e comece.

## 3. Por etapa

Siga o `docs/PROCESS.md` ("Fluxo automatizado", item 3) e as mensagens do `docs/FLOW.md`, com o que esta seção acrescenta. Atualize o painel em cada passo marcado com ▸ (seção "Painel").

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

   Guarde a filha: `row '#n' child=<id> childAt=now`. ▸ fase aberta.

   Quando a fase avisar: ▸ fase `ok`, o PR no passo e `child=` (vazio), e guarde os "Defeitos pendentes" no `log`.

3. **Testador.**
   - `list_environments`: use o "Mapping - testes".
   - A mensagem é a do `docs/FLOW.md`, com os roteiros e a passada visual da seção **Testador**. A rodada completa vai em 5 blocos; a dirigida com mais de 40 passos sem o R0 vai em grupos (`node scripts/testing/round-guide.mjs --grupos <roteiros>` no clone do épico, uma sessão por grupo, até 5; `docs/FLOW.md`, "Rodada dirigida em grupos").
   - Guarde as filhas: `row '#n' child="<id1> <id2> …" childAt=now`. ▸ `stage: Testador`.
   - Quando um testador avisar: tire o id dele de `child`. Com todos os avisos: ▸ log com o total de ✅/❌, os links dos relatos e o tempo. Não leia os relatos: o aviso traz o total e o link, e quem lê os achados é o subagente da correção.
4. **Correção** (regra 2), enquanto houver ❌, observação que é defeito ou defeito pendente:
   - peça a um subagente (`model: "sonnet"`) que crie a sub-issue `step` de correção: o briefing traz a etapa (pai), o código próprio (por exemplo `CL3`, `CL4`…), os links dos relatos, os defeitos pendentes com a origem e o aceite do `docs/FLOW.md` ("Fase de correção"); ele lê os relatos, lista os ❌ e as observações que são defeito, cria a sub-issue com `issue_write` e `parent_issue_number` e devolve **só** "#<número>: <N> achados (<códigos>)";
   - crie a sessão filha com a mensagem da fase e, depois dela, o reteste dirigido (`docs/FLOW.md`), **numa sessão só** com os achados de todos os grupos ou blocos e os passos que as correções afetam; correção mesclada antes de o reteste começar entra nele ("Reteste junto");
   - ▸ `stage: Correção` e uma fase nova em `phases`.

   O que pede decisão do dono segue a regra 1.

5. **Fechamento:**
   - antes do push, rode `npx vitest run tests/tooling`: o registro do DS com data precisa das seções `## Sincronização` e `## Ficou sem gravar`;
   - confira o passo "Versão do MCP": se `git diff --name-only origin/main...HEAD` toca algum arquivo de `scripts/release/releaseInputs.mjs`, a versão em `mcp/version.ts` precisa ser nova;
   - o resto segue o `docs/PROCESS.md`:
     - changelog e registro do DS renomeados com a data (`git mv`);
     - pendências aplicadas no artefato do DS;
     - descrição final do PR do épico, com "Closes #<etapa>";
     - comentário de fechamento na issue;
   - cada item que ficou para depois vira uma `roadmap` (com o impacto), ou um `bug` se pedir decisão;
   - ▸ `stage: Fechamento`, e cada issue nova no dataset `issues`.
6. **Merge** (seção "Merge"). Depois do merge:
   - confira o "MCP release" por um subagente (`model: "haiku"`), com o briefing "Confira, só lendo, a execução do workflow MCP release do commit `<sha do merge>` em fabianofranca/mapping (`actions_list` com `perPage: 1`) e, se a versão `<v>` é nova, a release `mcp-v<v>` (não é pre-release; tem `mapping-mcp.js`, `setup.sh`, `SKILL.md`, `AGENTS.mapping.md` e `watch-comments.mjs`, cada um com o `.sha256`; as rc da versão sumiram); sem versão nova, que o job `release` foi pulado. Devolva uma linha: ok, ainda rodando, ou falhou com o motivo e o link." Ainda rodando: pergunte de novo na próxima conferência;
   - ▸ `status: concluída`, `stage: Mesclada`, `ended: now`.
7. **Entre etapas:**
   - liste as `ready` de novo e refaça a ordem das que aguardam (seção "Mudanças na fila durante a execução");
   - confira o contexto e se o skill mudou na `main` ("Troca de sessão");
   - comece a próxima etapa livre.

**Conferências de reserva:**

- **Uma por sessão do coordenador**, não uma por filha: `create_trigger` sem `persistent_session_id` (dispara nesta sessão), `cron_expression: "0 * * * *"` (de hora em hora), `initiation: own_followup`, com o id guardado por `painel.py reserve`. Ela vale para todas as filhas e é apagada só na troca de sessão e no fim. Nada de `send_later` por filha, nada de `delete_trigger` a cada aviso, nunca `list_triggers`.
- A mensagem guardada se sustenta sozinha: "Conferência da fila: rode `painel.py show` e confira as atrasadas; painel <url>; siga o skill implementar-fila".
- Na conferência, confira primeiro se o skill mudou na `main` ("Troca de sessão"); se mudou, passe a coordenação adiante e pare aqui. Depois, `show` lista as **atrasadas** (filha sem aviso há mais de 60 min). Sem atrasadas (e sem conferência de Release pendente), não faça mais nada nesse ciclo: nem publicar o painel.
- Para cada atrasada, leia `get_session` (`status_bucket`) e, só se não estiver trabalhando, `list_events` com `kinds: ["assistant", "result"]` e `limit: 10`:
  - trabalhando: `row '#n' childAt=now` (volta a contar);
  - falhou, parou pedindo permissão ou morreu: crie a sessão de novo uma vez, com a mesma mensagem e mais "a sessão anterior (<id>) parou em: <o que os eventos mostram>";
  - se acontecer de novo, a etapa vira `falhou`, o dono é notificado e a fila segue.

**CI vermelho no PR do épico** (o job `epic` ou a trava da versão, por exemplo): corrija no próprio épico. Se for registro (changelog, DS, versão), basta um commit do coordenador. Se for código, abra uma fase de correção.

## Mudanças na fila durante a execução

A fila é refeita sempre que algo muda, sem parar o que está rodando.

- **Entre etapas** (passo 7 de "Por etapa"), o coordenador lista as `ready` de novo por conta própria.
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

Com o fechamento feito e o CI verde. Quem confere o CI e se o PR pode ser mesclado é um subagente (`model: "haiku"`, "Confira, só lendo, o PR #<n> de fabianofranca/mapping: os checks do último commit e se ele é mesclável. Devolva uma linha: verde e mesclável, ou o que falta, com o nome do check que falhou"):

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
painel.py issue <pasta> number=#m etapa=#n …
painel.py reserve <pasta> <trig_id>                  # a conferência de reserva da sessão
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

Grave no `painel.py` **a cada passo** (fase aberta e mesclada, PR, testador, correção, fechamento, merge, nova `ready`, issue criada) e **publique uma vez por ciclo**, no fim, só os arquivos que mudaram ("Economia de contexto", item 7). Se um blob voltar 404, envie de novo e repõe o dataset.

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

**Skill novo na `main`** (decisão do dono de 2026-11-09, #1298): a fila passa para o skill novo assim que ele é entregue. Entre etapas e em cada conferência de reserva, rode `git fetch -q origin main && git diff --quiet HEAD origin/main -- .claude/skills/implementar-fila`. Saída diferente de zero quer dizer que o skill mudou: passe a coordenação adiante, **mesmo abaixo de 60%**. Antes do passo 1 abaixo, traga o skill novo para o seu clone (`git checkout origin/main -- .claude/skills/implementar-fila`), para gravar o painel com o `painel.py` novo, e a `PushNotification` do passo 5 diz "Fila passou para uma sessão nova (skill atualizado na main)". As filhas que estão rodando não mudam: só o coordenador é trocado.

**Na sessão antiga:**

1. Publique o painel atualizado.
   Tudo o que a sessão nova precisa saber vai no painel: a ficha de cada etapa (`plan`), as filhas que devem aviso (`child`), o passo de cada etapa e, no `log`, os defeitos pendentes e as restrições fixas do dono.
2. Crie a sessão nova com `create_session`:
   - o mesmo `model`;
   - `source_url` do repositório, `source_revision` `main`;
   - título "Fila — coordenador";
   - mensagem: **só** `/implementar-fila retomar anterior=<id desta sessão> painel=<url>`, seguida dos mesmos argumentos desta sessão e de `sem-confirmar`. Copie `mesclar=auto` só se o dono o escreveu na chamada desta sessão. Sem notas de passagem: o que não está no painel, grave no `log` antes.
3. Mande a cada filha que ainda deve aviso (os `child` do painel) `send_message`: "O coordenador mudou: mande seus avisos para `<id novo>`".
4. Apague a sua conferência (`delete_trigger` com o `reserve` do painel).
5. Mande `PushNotification` "Fila passou para uma sessão nova".
6. Termine. Se depois chegar o aviso de uma filha, encaminhe-o sem mudar nada à sessão nova (`send_message`) e termine de novo.

**Na sessão nova** (`retomar`):

1. Leia o painel: `ArtifactData` `list` de `datasets` e `Artifact` `read` com `path` = o id de cada `/_blob/<id>`, com `out_dir` na pasta do scratchpad. Não imprima os arquivos: rode `painel.py show`.
2. Não releia as issues nem as filhas: a ficha (`plan`), as filhas (`child`) e o passo estão no painel, e a sessão antiga já avisou as filhas do seu id. Sem `list_sessions`, sem `list_events` e sem `get_session` das filhas; a conferência de reserva cuida das que atrasarem.
3. Crie a sua conferência de reserva (`painel.py reserve`) e continue de onde parou.

## Fim

Quando nenhuma etapa está aguardando nem em andamento:

1. Responda no chat com uma tabela, com uma linha por etapa: a issue com link, o resultado (concluída, falhou ou esperando dono), o PR do épico, a duração, o número de fases e de correções, e a versão do MCP. Depois liste as issues criadas, com link, e o que espera o dono.
2. Atualize o painel (`current` "Fila concluída") e apague a conferência de reserva (`delete_trigger` com o `reserve`).
3. Mande `PushNotification` com o total, por exemplo "Fila concluída: 8 mescladas, 1 esperando você".
4. Não arquive as sessões filhas sem o dono pedir.
