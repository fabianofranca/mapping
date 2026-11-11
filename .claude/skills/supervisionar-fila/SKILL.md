---
name: supervisionar-fila
description: Supervisiona a fila de desenvolvimento do fabianofranca/mapping numa sessão Opus high fora da fila. Lê o painel "Fila de desenvolvimento", confere o coordenador, os PRs e o CI, investiga as dúvidas do dono, escreve issues e manda ao coordenador os pedidos do tipo A (SUP-n); os do tipo B ela explica e recomenda. Troca de sessão sozinha a ~25% de contexto, com a passagem no artefato "Supervisão da fila". Faz a análise de custo sob demanda. Use quando o dono pedir para supervisionar a fila, abrir ou retomar a supervisão, analisar o custo da fila, ou rodar /supervisionar-fila.
---

# Supervisionar a fila

Esta sessão é o **supervisor**: uma conversa Opus fora da fila, ao lado do coordenador do [`implementar-fila`](../implementar-fila/SKILL.md). Ela lê, investiga, avalia as decisões do dono, escreve issues e entrega texto pronto. O que é próprio da supervisão está aqui; o resto fica nos documentos e não se repete: o fluxo de entrega no [`docs/PROCESS.md`](../../../docs/PROCESS.md), as mensagens e a Leitura do CI no [`docs/FLOW.md`](../../../docs/FLOW.md), o painel e os pedidos no `implementar-fila`.

Rode este chat em **`claude-opus-5-5` com `effort: high`**. Um supervisor no esforço padrão falhou em decisões: ao começar, confira `effort_level` e `session_context.model` no `get_session` desta sessão e, se não baterem, avise o dono em uma linha.

## Argumentos

`/supervisionar-fila [retomar anterior=<id>] [painel=<url>] [custo] [varredura desde=<ISO>]`

- `retomar anterior=<id>`: esta sessão é a sucessora de `<id>` ("Troca de sessão", abaixo).
- `painel=<url>`: o artefato do painel "Fila de desenvolvimento". Sem ele, `Artifact` `list` e o mais recente com esse título.
- `custo`: responde com o custo da fila lendo o `painel.py costs` (total, tipos e etapas), sem varredura.
- `varredura desde=<ISO>`: a análise completa, como a de 2026-11-10 (seção "Custo sob demanda").

## Papel e limites

- Não mescla, não empurra, não cria nem arquiva sessão da fila. A exceção é o próprio antecessor, que o sucessor arquiva ("Troca de sessão"). Pode criar sessões e agendamentos que não são da fila (o sucessor, a coordenadora do CR por épico) quando o dono decidir.
- Permissão nunca vai em mensagem de fase nem de coordenador.
- O prompt agendado de outra sessão só muda por `send_message` a ela, com conferência por `get_trigger`.
- Quem executa na fila é o coordenador. A supervisão não grava no painel, salvo o artefato da passagem.
- A sessão que deixou de ser a registrada (`painel.py roles`) **não age**: encaminha, sem mudar, o pedido ou o aviso que chegar à atual (`send_message`) e responde ao dono só com o link da atual.

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
- **Leitura:** no começo de cada turno, baixe o `meta` do painel e rode `painel.py requests <pasta>` (e `painel.py roles <pasta>`), para saber o que foi aplicado, recusado ou perguntado. O coordenador só acorda o supervisor em recusa, erro e resposta do dono a um tipo B; o pedido aplicado aparece apenas na tabela.
- **Texto para o chat da fila:** leva só regra, nunca estado, e diz em que chat colar.

## Regras de escrita

- **Escreva regras, não estados.** Uma frase de estado numa passagem ("falta marcar #1466 como ready") vira tarefa indevida na sessão seguinte.
- **Relatório de subagente é indício:** confira na fonte antes de repassar.
- **Meça antes de prever.** A troca do coordenador por skill novo se decide por `git diff --numstat` do `SKILL.md`, não por palpite.
- **Antes de dizer que algo conflita, leia a issue e a ficha.** "Ficha sem dep" queria dizer `dep=?`, não "sem dependência".
- **Releia a pergunta do dono antes de responder.** "A fila também roda CR" pedia a sobreposição dentro da fila, não a do CR noturno.

## Leitura das fontes

- **CI:** pela **Leitura do CI** do item 6 de "Para a sessão da fase" do `docs/FLOW.md`, fonte única; esta skill não a repete. CI sem execução no commit atual até ~10 min depois do push é atraso do GitHub; depois disso, `actions_list`.
- **Painel:** o `painel.py` (`.claude/skills/implementar-fila/painel/painel.py`) roda numa cópia local dos três blobs (`meta`, `queue`, `log`), lidos com `Artifact` `read` e `path` = o id do blob. O `requests`, o `roles` e o `costs` leem só o `meta`; o `show` completo pede os três.
- **`list_events` e transcripts:** só por subagente Sonnet, que devolve um resumo curto (os maiores resultados de ferramenta são `list_events` do coordenador e `issue_read` com sub-issues). O Opus lê o painel, que é JSON pequeno, e a tabela de pedidos. Um `list_events` grande vai para arquivo e se lê com `python3 -I`, filtrando o fio principal (sem `agent_id`).

## Troca de sessão

Cada mensagem depois de mais de 1 h regrava o contexto inteiro, e a supervisão passa horas parada. Por isso o limite é baixo: troque **acima de ~25% de contexto (~250k)**, ou **ao fim de um turno com mais de ~150k sem nada agendado nesta sessão para a próxima hora**. Leia `external_metadata.context_usage` no `get_session` desta sessão ao fim de cada turno.

**Na sessão antiga:**

1. Confira o limite de linhagem como no coordenador ("Limite de linhagem" do `implementar-fila`): `lineage.depth + 2 > lineage.limit` impede o sucessor; avise o dono com o comando para abrir uma sessão nova.
2. Escreva a passagem no artefato Markdown **"Supervisão da fila"** (sempre o mesmo link; só a sessão registrada escreve), como regras: decisões do dono, issues abertas, agendamentos com a condição de parada, lições. Estado conferível fica nas fontes, não nela.
3. `create_session` com `source_url` do repositório, `model: claude-opus-5-5`, `effort: high`, título "Supervisor <n>" (<n> = o `n` do `roles` mais 1) e a mensagem `/supervisionar-fila retomar anterior=<id desta sessão> painel=<url>`.
4. Confira o `effort_level` da nova no `get_session`; se não for `high`, avise o dono.
5. Recrie na sucessora os agendamentos ligados a esta sessão e apague os daqui (o `update_trigger` não troca a sessão). Mande `PushNotification` com o link da nova e pare: esta sessão não age mais.

**Na sessão nova (`retomar`):**

1. Leia a passagem, o `painel.py requests` e o `painel.py roles`; confira o coordenador e responda ao dono em poucas linhas.
2. Mande ao coordenador o pedido de registro (tipo A): `role supervisor <id desta sessão> link=<link da passagem>` e o custo do antecessor (do `get_session` dele).
3. Com o registro aplicado, arquive o antecessor (`archive_session`; só ids registrados no painel) e confira no `get_session` que ficou arquivado. Se não ficou, tente mais uma vez; se ainda não, avise o dono.
4. O limite de linhagem é o do coordenador.

## Vigiar uma condição

A sessão Opus fica sem conferências periódicas (sem conferências periódicas, em uma regra): das 14 conferências de 2026-11-10, só 3 acharam algo, e cada uma custou a releitura do contexto. A supervisão age quando o dono pergunta. Para vigiar uma condição, crie uma tarefa agendada que abre sessão nova a cada disparo (`create_trigger` com `create_new_session_on_fire`), troque o modelo para Sonnet ou Haiku com `update_trigger` logo depois de criar, e escreva o prompt para só notificar quando houver algo. O `send_later` nesta sessão só vale quando o dono pede.

## Subagentes

Sonnet para transcripts e conferências de rotina (check runs, PRs, painel). Opus só para a revisão independente de texto de issue contra o código.

## Custo sob demanda

- `custo`: o `painel.py costs <pasta>` sobre o `meta` baixado responde "por que este épico custou X?" (total, tipo e etapa).
- `varredura desde=<ISO>`: subagentes Sonnet listam as sessões criadas desde a data e gravam o `get_session` de cada uma (uma linha JSON por sessão) num arquivo; depois rode `python3 -I .claude/skills/supervisionar-fila/custo.py <arquivo.jsonl>`, que agrega por grupo (Testador, Fase, Coordenador, Detalhamento, Supervisão, Reteste, Correção, Fechamento e Outras) e dá o número de sessões, o US$, a mediana e o % por modelo. Compare com a linha de base da #1532.
