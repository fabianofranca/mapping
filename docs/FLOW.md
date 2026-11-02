# Fluxo automatizado — mensagens prontas

As regras estão no `CLAUDE.md` ("Fluxo automatizado"); aqui ficam só as mensagens. Os trechos `<…>` são lacunas a preencher.

## Para o dono, nos três chats

1. Roadmap (qualquer modelo):

```text
Crie uma issue roadmap: <ideia ou problema>. Origem: <de onde veio>.
```

2. Detalhamento (Fable ou Opus):

```text
Detalhe a issue #<roadmap> como etapa, com as fases e a tabela de modelos (linha Orquestrador e coluna Testador). Pergunte o que for decisão de produto.
```

3. Implementação (no modelo da linha Orquestrador, no modo Auto):

```text
Implemente a etapa #<etapa> no fluxo automatizado. Me chame só para confirmar o merge.
```

Para confirmar o merge final, o dono responde no chat de implementação: `pode mesclar`.

## Para a sessão da fase

O orquestrador cria a sessão com `create_session`: `model` da tabela, `source_url` do repositório, `source_revision` = `epic/<nome>`, nunca `permission_mode: plan`. Mensagem:

```text
Você é o agente da fase <código> — <título> da etapa #<etapa> do repositório `fabianofranca/mapping`, no fluxo automatizado (CLAUDE.md, "Fluxo automatizado"). Ninguém está olhando esta sessão: não pergunte nada ao dono.

1. Leia o `CLAUDE.md`, a issue #<etapa> com os comentários e a sub-issue #<fase>, que é o seu plano. Siga-a; não reabra decisões já tomadas.
2. Branch `<branch curto>`, saído do `epic/<nome>` atualizado. PR com base `epic/<nome>`, título "<código> — <título>", corpo começando com "Parte de #<fase>" e as seções de sempre (Resumo, Como testar, Decisões tomadas, Impacto no DS).
3. Subagentes e esforço: <da sub-issue, ex.: Sonnet medium; mecânicos Haiku low>.
4. Todo briefing de mudança de comportamento ou correção segue a regra "teste primeiro" do `CLAUDE.md` ("Uso de modelos"): teste visto falhando antes do código, e o subagente devolve o nome dele e a falha.
5. Antes do PR: `npm run lint && npm run typecheck && npm test && npm run build`.
6. Acompanhe o PR (`subscribe_pr_activity`) e corrija o CI. Com o CI verde, mescle o PR no épico, marque os checkboxes e feche a sub-issue (`completed`).
7. Avise o coordenador por `send_message`: o link do PR mesclado, um resumo de 5 a 10 linhas e as decisões tomadas fora da sub-issue.
8. Decisão de produto que a sub-issue não cobre: não invente. Mande a pergunta e as opções ao coordenador por `send_message` e espere a resposta.
<Só na última fase: ponha o rótulo `mcp-rc` no PR.>

Coordenador: `<id da sessão do orquestrador>`
```

## Fase de correção

Com ❌ no relato, o orquestrador cria uma sub-issue `fase` de correção (com `parent_issue_number` da etapa, a lista dos achados com o link do comentário do relato e o aceite "os roteiros que falharam passam") e uma sessão filha com a mesma mensagem da fase, apontando essa sub-issue. Só uma correção por etapa. Na segunda falha, em achado de perda de dados, integridade do `mapping.json` ou segurança, ou se a correção pedir decisão de produto, o orquestrador chama o dono.

## Para o testador

O orquestrador acha o ambiente "Mapping - testes" com `list_environments` e cria a sessão com `create_session`, `source_url` do repositório e `source_revision` = `epic/<nome>`:

```text
Leia `docs/TESTING-NUVEM.md` e execute no modo dirigido: <roteiros da sub-issue da última fase>. Branch `epic/<nome>`, commit `<hash>`. Relato na sub-issue #<última fase>. Coordenador: `<id da sessão do orquestrador>`.
```

Reteste, depois da correção:

```text
Leia `docs/TESTING-NUVEM.md` e execute no modo dirigido: os achados <números> do relato em <link do comentário>. Branch `epic/<nome>`, commit `<hash da correção>`. Relato na sub-issue #<fase de correção>. Coordenador: `<id da sessão do orquestrador>`.
```

## Notificação final

`PushNotification`, depois do fechamento:

```text
Etapa #<etapa> pronta: <resumo em uma linha>. PR do épico: <link>. Responda "pode mesclar" no chat.
```
