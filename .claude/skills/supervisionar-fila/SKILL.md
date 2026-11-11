---
name: supervisionar-fila
description: Supervisiona a fila de desenvolvimento do fabianofranca/mapping numa sessão Opus high fora da fila. `/supervisionar-fila` sem argumentos acha o painel e decide o papel da sessão (nova, sucessora ou sessão que não age). Investiga as dúvidas do dono, escreve issues e manda ao coordenador os pedidos do tipo A (SUP-n). O dono troca de sessão ao voltar depois de 1 h; a troca automática é só acima de ~50% de contexto. A passagem fica no artefato "Supervisão da fila" (database). Faz a análise de custo.
---

# Supervisionar a fila

Esta sessão é o **supervisor**: uma conversa Opus fora da fila, ao lado do coordenador do [`implementar-fila`](../implementar-fila/SKILL.md). Ela lê, investiga, avalia as decisões do dono, escreve issues e entrega texto pronto. O que é próprio da supervisão está aqui; o resto fica nos documentos e não se repete: o fluxo de entrega no [`docs/PROCESS.md`](../../../docs/PROCESS.md), as mensagens e a Leitura do CI no [`docs/FLOW.md`](../../../docs/FLOW.md), o painel e os pedidos no `implementar-fila`.

Rode este chat em **`claude-opus-5-5` com `effort: high`**. Um supervisor no esforço padrão falhou em decisões: ao começar, confira `effort_level` e `session_context.model` no `get_session` desta sessão e, se não baterem, avise o dono em uma linha.

## Argumentos

`/supervisionar-fila` sem argumentos é a forma normal: a sessão acha o painel, decide o papel e faz o que ele pede ("Leitura das fontes", "Papel e limites"). Os argumentos abaixo continuam valendo quando escritos.

`/supervisionar-fila [retomar] [anterior=<id>] [painel=<url>] [custo] [varredura desde=<ISO>]`

- `retomar`: sozinho, vale o mesmo que nenhum argumento (é o texto fixo `/supervisionar-fila retomar painel=<url>` que o dono usava).
- `anterior=<id>`: o antecessor esperado. Se o `roles.supervisor` for outro, vale o `roles` (a sessão registrada é a autoridade) e a sessão diz isso em uma linha.
- `painel=<url>`: o artefato do painel; pula a busca do painel.
- `custo`: responde com o custo da fila lendo o `painel.py costs` (total, tipos e etapas), sem varredura.
- `varredura desde=<ISO>`: a análise completa, como a de 2026-11-10 (seção "Custo sob demanda").

## Papel e limites

- Não mescla, não empurra, não cria nem arquiva sessão da fila. A exceção é o próprio antecessor, que o sucessor arquiva ("Troca de sessão"). Pode criar sessões e agendamentos que não são da fila (o sucessor, a coordenadora do CR por épico) quando o dono decidir.
- Permissão nunca vai em mensagem de fase nem de coordenador.
- O prompt agendado de outra sessão só muda por `send_message` a ela, com conferência por `get_trigger`.
- Quem executa na fila é o coordenador. A supervisão não grava no painel, salvo o artefato da passagem.
- O papel desta sessão sai da linha `esta sessão:` do `painel.py roles --sessao <id desta sessão> <pasta>`: `registrada` age; `sucessora` e `nova` fazem a retomada ("Troca de sessão") e, até o coordenador aplicar o registro, só leem e mandam o pedido de registro (tipo A, o único que a não registrada manda), enquanto o antecessor já não age; `antiga` e `coordenador` **não agem**: encaminham, sem mudar, o pedido ou o aviso que chegar à supervisora atual (`send_message`) e respondem ao dono só com o link `https://claude.ai/code/<id da supervisora atual>` (na `coordenador`, com a frase "este chat é o coordenador; abra uma sessão nova para a supervisão").

## Pedidos ao coordenador

O coordenador aplica os pedidos do **tipo A** sem perguntar ao dono; a lista é fechada e é a de "Pedidos do supervisor" do `implementar-fila` (qualquer mudança lá muda aqui, e o teste confere):

**Tipo A**

- segurar ou soltar uma etapa (`hold`);
- reordenar, pausar, retomar e drenar ("Mudanças na fila durante a execução");
- regra de escrita do painel (`rule add`, com `origem=SUP-<n>`);
- "confira X": uma conferência só de leitura, com a resposta na evidência;
- registrar o supervisor: `role supervisor <id> link=<passagem>` e o custo do antecessor, que o pedido traz (`cost <pasta> <id> usd=… ctx=… model=… effort=… kind=supervisor`).

- **Envio:** `send_message` ao `roles.coordenador`, no formato `SUP-<n> (tipo A): <pedido>. Supervisor: <id desta sessão>`, com `n` = o maior número da tabela mais 1. O coordenador grava, aplica e registra a evidência no painel.
- **Tipo B**, todo o resto (merge, `mesclar=auto`, escopo ou decisão de produto, apagar algo, permissões, regra que não é de escrita do painel): explique ao dono e recomende. Ele responde no chat da fila, e o coordenador pergunta a ele ali. A supervisão nunca repassa um "sim" do dono: só vale a resposta dele no chat da fila.
- **Leitura:** no começo de cada turno, baixe o `meta` do painel (`ArtifactData` `get` de `datasets`/`meta` e o blob com `Artifact` `read` e `out_dir`, "Leitura das fontes") e rode `painel.py requests --desde <hora da leitura anterior> <pasta>` e `painel.py roles --sessao <id desta sessão> <pasta>`, para saber o que foi aplicado, recusado ou perguntado e se esta sessão ainda é a registrada; a tabela inteira (`painel.py requests <pasta>`) só na retomada. O coordenador só acorda o supervisor em recusa, erro e resposta do dono a um tipo B; o pedido aplicado aparece apenas na tabela.
- **Texto para o chat da fila:** leva só regra, nunca estado, e diz em que chat colar.

## Regras de escrita

- **Escreva regras, não estados.** Uma frase de estado numa passagem ("falta marcar #1466 como ready") vira tarefa indevida na sessão seguinte.
- **Relatório de subagente é indício:** confira na fonte antes de repassar.
- **Meça antes de prever.** A troca do coordenador por skill novo se decide por `git diff --numstat` do `SKILL.md`, não por palpite.
- **Antes de dizer que algo conflita, leia a issue e a ficha.** "Ficha sem dep" queria dizer `dep=?`, não "sem dependência".
- **Releia a pergunta do dono antes de responder.** "A fila também roda CR" pedia a sobreposição dentro da fila, não a do CR noturno.

## Leitura das fontes

- **CI:** pela **Leitura do CI** do item 6 de "Para a sessão da fase" do `docs/FLOW.md`, fonte única; esta skill não a repete. CI sem execução no commit atual até ~10 min depois do push é atraso do GitHub; depois disso, `actions_list`.
- **Achar o painel** (sem `painel=<url>`): `Artifact` `list` (`scope: "mine"`, `limit: 50`). A listagem mostra o painel como "Estado da execução" (há três com esse nome, e o da fila é o único `pinned`), e não como "Fila de desenvolvimento". Os candidatos são os títulos "Estado da execução", "Fila de desenvolvimento" e "Mapping Fila", os `pinned` primeiro e depois do mais recente ao mais antigo. Para cada um, baixe o `meta` (item seguinte) e rode `painel.py roles <pasta>`: o painel é o primeiro em que o `roles` mostra ao menos um papel (não imprime `—` nos dois). Nenhum serve: peça o link ao dono em uma linha e pare.
- **Painel:** o `painel.py` (`.claude/skills/implementar-fila/painel/painel.py`) roda numa cópia local dos blobs. O `meta` (~30 KB) vai para arquivo e nunca entra no contexto: `ArtifactData` `get` (coleção `datasets`, documento `meta`) dá o id do blob, e `Artifact` `read` com `path` = o blob e `out_dir` o grava sem trazer o conteúdo. Nunca o `list` dos três datasets nem `cat`: só a saída do `painel.py` entra. O `requests`, o `roles` e o `costs` leem só o `meta`; o `show` completo pede os três blobs (`meta`, `queue`, `log`).
- **Pesos da retomada:** o `get_session` de outra sessão custa ~3 KB. Leia o `get_session` do antecessor uma vez, para o custo do pedido de registro, e o do coordenador só quando a pergunta do dono pede. A passagem se lê pela database ("Passagem"), nunca como HTML.
- **`list_events` e transcripts:** só por subagente Sonnet, que devolve um resumo curto (os maiores resultados de ferramenta são `list_events` do coordenador e `issue_read` com sub-issues). O Opus lê só a saída do `painel.py` e a tabela de pedidos. Um `list_events` grande vai para arquivo e se lê com `python3 -I`, filtrando o fio principal (sem `agent_id`).

## Troca de sessão

Cada mensagem depois de mais de 1 h regrava o contexto inteiro, e a supervisão passa horas parada; em conversa seguida, o contexto grande sai a preço de leitura de cache. Por isso a troca que economiza é a do dono ao voltar, e a automática fica só para a conversa seguida.

**Tamanho e base.** A medida é o `external_metadata.context_usage.used_tokens` do `get_session` sem `session_id`. A **base** é essa medida no fim do primeiro turno desta sessão; sem ela (contexto compactado, ou sessão anterior a esta skill), vale 120 mil, a base medida em 2026-11-11.

- **A partir de 2× a base**, no fim de cada turno, a resposta ao dono termina com a linha fixa: "Contexto: <n> mil, mais de 2× a base (<b> mil). Depois de mais de 1 h sem conversa, mande `/supervisionar-fila` numa sessão nova."
- No fim de um turno **acima de ~50%** (`used_tokens` acima da metade de `max_tokens`, ~500k), a própria supervisão cria a sucessora ("Na sessão antiga"). É a regra só da conversa seguida; a compactação automática começa em ~784k.

**Troca no retorno (a normal).** Ao voltar depois de mais de 1 h, o dono abre uma sessão nova em `claude-opus-5-5` com `effort: high` e manda `/supervisionar-fila`, em vez de escrever na antiga. A sessão que o dono abre começa no nível 0 da linhagem: esta troca não gasta vaga. A sessão nova cai em "Na sessão nova".

**Na sessão antiga** (só a troca automática). A troca não tem turno de passagem: a passagem já está em dia ("Passagem"), e a sessão só confere que nada deste turno ficou por escrever e cria a sucessora.

1. Confira o limite de linhagem ("Limite de linhagem" do `implementar-fila`). O sucessor não cria sessões da fila, então basta uma vaga: com `lineage.depth + 1 > lineage.limit`, **não crie a sucessora**, mande ao dono `PushNotification` "Supervisão acima de 50% e sem vaga na linhagem: abra uma sessão nova e mande `/supervisionar-fila`" e siga respondendo. Avise uma só vez por sessão: se já avisou neste chat, não repita a cada turno.
2. Confira que a passagem está em dia.
3. `create_session` com `source_url` do repositório, `model: claude-opus-5-5`, `effort: high`, título "Supervisor <n>" (<n> = o `n` do `roles` mais 1) e a mensagem `/supervisionar-fila retomar anterior=<id desta sessão> painel=<url>`.
4. Confira o `effort_level` da nova no `get_session`; se não for `high`, avise o dono.
5. Mande `PushNotification` com o link da nova e pare: esta sessão não age mais. Os agendamentos ligados a ela ficam como estão: quem os recria é a sucessora.

**Na sessão nova** (a troca no retorno e a automática). Rode `painel.py roles --sessao <id desta sessão> <pasta>` e siga a linha `esta sessão:`:

- `registrada`: o dono chamou a skill de novo no mesmo chat; siga como a supervisora de agora.
- `sucessora (antecessor: <id>)`: faça a retomada inteira, abaixo.
- `nova (nenhum supervisor registrado)`: comece uma supervisão nova. Crie o artefato da passagem ("Passagem") e peça o registro sem custo de antecessor.
- `antiga (atual: <id>)` e `coordenador (não supervisiona)`: não agem ("Papel e limites").

A retomada da `sucessora`:

1. Leia a passagem pela database ("Passagem"); na primeira retomada depois do merge deste épico o `list` vem vazio porque a passagem ainda é o Markdown antigo, e então leia o Markdown (o `Artifact` `read` do link) e migre-o depois do registro ("Passagem" › "Migrar"). Leia também o `painel.py requests` (a tabela inteira) e o `painel.py roles`; confira o coordenador e responda ao dono em poucas linhas.
2. Mande ao coordenador o pedido de registro (tipo A): `role supervisor <id desta sessão> link=<link da passagem>` e o custo do antecessor (do `get_session` dele). O registro grava esse custo com `kind=supervisor` em `meta.sessions`, e é isso que faz o `painel.py` reconhecer o antecessor como `antiga` e o de duas gerações atrás como `sucessora`: o pedido sempre traz o custo, com `kind=supervisor`.
3. O coordenador não avisa o pedido aplicado, e a supervisão não vigia: no começo de cada turno seguinte, quando o `esta sessão:` disser `registrada`, arquive o antecessor (`archive_session`; só ids registrados no painel) e confira no `get_session` que ficou arquivado. Se não ficou, tente mais uma vez; se ainda não, avise o dono. Pedido de registro `atrasado` no `requests` é recusa em potencial: avise o dono.
4. Com o registro aplicado, recrie os agendamentos presos à sessão do antecessor (os de `persistent_session_id` igual ao dele, como o `send_later`; os de vigia, de `create_new_session_on_fire`, não pertencem a sessão nenhuma e ficam como estão): leia os documentos `agendamento` da passagem (na primeira retomada, as linhas de agendamento do Markdown) e, para cada um desses, crie o agendamento nesta sessão, apague o antigo (`delete_trigger` com o `trigger` do documento) e atualize o `trigger` do documento. Pule o que já aponta para esta sessão (`get_trigger`).
5. A sessão antiga, já avisada, fica parada até ser arquivada; se o dono falar com ela, ela só responde com o link da atual.

## Passagem

A passagem mora na **database** do artefato "Supervisão da fila" (sempre o mesmo link): a página `.claude/skills/supervisionar-fila/passagem/index.html`, publicada com a capacidade `db`, só lê e mostra a coleção `passagem`. Só a sessão `registrada` escreve regras; a `nova` só cria o artefato ("Criar") e grava as decisões do dono dadas antes do registro. Cada regra é um documento:

- id `<tipo>-<nome curto>`; campos `tipo` (`decisao`, `issue`, `agendamento` ou `licao`), `texto` (a regra, nunca um estado), `origem` (ex.: "dono, 2026-11-11, chat do supervisor" ou "#1643") e `desde` (AAAA-MM-DD);
- o `agendamento` tem também `trigger` (o id do agendamento) e `parada` (a condição de parada).

**Ler:** `ArtifactData` `list` da coleção `passagem` (só JSON, sem HTML nem CSS), seguindo o `next_cursor` até o fim. **Gravar:** um `set`, `update` ou `delete` por mudança (um `batch` quando são várias), com o `if_version` lido do documento; documento novo não tem versão e se grava sem ele. Nunca republique a página para mudar uma regra, e não carregue a skill `artifact-design` para isso.

**Em dia no mesmo turno.** A passagem fica em dia no mesmo turno de cada decisão do dono, issue aberta, agendamento ou lição, e a regra com a condição de saída vencida sai no mesmo turno (`delete`). Por isso a troca de sessão não tem turno de passagem. Escreva regras, não estados ("Regras de escrita").

**Criar (`nova`).** Antes, procure um artefato "Supervisão da fila" já existente (`Artifact` `list`): se existe, é a passagem, e vale o "Migrar" abaixo com o link dele; não crie um segundo. Senão, publique a página `passagem/index.html` com `Artifact` (`file_path` = ela, sem reescrevê-la) e `capabilities: {db: {}}`, e grave as regras que o dono já deu.

**Migrar, uma vez.** A primeira supervisora já registrada depois do merge deste épico, se o `list` da coleção `passagem` vier vazio **e o artefato ainda é o Markdown** (a coleção vazia sozinha não basta: ela também fica assim quando todas as regras saem por vencidas), migra a passagem Markdown: leia-a uma vez (a retomada já a lê), leia o arquivo inteiro do artefato como a ferramenta exige de arquivo que ela não escreveu, republique o mesmo link com a página `passagem/index.html` e `capabilities: {db: {}}`, e grave as regras num `batch`, sem as que têm a condição de saída vencida (as "até a #1643 ser mesclada" dos comentários). Antes do registro ela só lê ("Papel e limites").

## Vigiar uma condição

Regra: sem conferências periódicas na sessão Opus. Das 14 conferências de 2026-11-10, só 3 acharam algo, e cada uma custou a releitura do contexto. A supervisão age quando o dono pergunta. Para vigiar uma condição, crie uma tarefa agendada que abre sessão nova a cada disparo (`create_trigger` com `create_new_session_on_fire`), troque o modelo para Sonnet ou Haiku com `update_trigger` logo depois de criar (decisão do dono de 2026-11-10, que vale como o pedido explícito que a ferramenta exige), e escreva o prompt para só notificar quando houver algo. O `send_later` nesta sessão só vale quando o dono pede.

## Subagentes

Sonnet para transcripts e conferências de rotina (check runs, PRs, painel). Opus só para a revisão independente de texto de issue contra o código. Todo briefing pede o retorno em até 10 linhas: os relatos longos pesam no contexto da supervisão.

## Custo sob demanda

- `custo`: o `painel.py costs <pasta>` sobre o `meta` baixado responde "por que este épico custou X?" (total, tipo e etapa).
- `varredura desde=<ISO>`: subagentes Sonnet listam as sessões criadas desde a data e gravam o `get_session` de cada uma (uma linha JSON por sessão) num arquivo; depois rode `python3 -I .claude/skills/supervisionar-fila/custo.py <arquivo.jsonl>`, que agrega por grupo (Testador, Fase, Coordenador, Detalhamento, Supervisão, Reteste, Correção, Fechamento e Outras) e dá o número de sessões, o US$, a mediana e o % por modelo. Compare com a linha de base da #1532.
