# Fluxo automatizado — mensagens prontas

As regras estão no `CLAUDE.md` ("Fluxo automatizado"); aqui ficam só as mensagens. Os trechos `<…>` são lacunas a preencher.

## Para o dono, nos três chats

1. Roadmap ou bug (qualquer modelo):

```text
Crie uma issue roadmap (ou bug, se for defeito): <ideia ou problema>. Origem: <de onde veio>.
```

Para um bug, o agente procura antes uma issue igual ou que o agrupe e põe o rótulo de severidade (`severity: high`, `severity: medium` ou `severity: low`), como diz o `CLAUDE.md` ("Bugs e evidência visual"); a mensagem não precisa pedir.

2. Detalhamento (Fable ou Opus):

```text
Detalhe a issue #<roadmap ou bug> como etapa, com as fases e a tabela de modelos (linha Orquestrador e coluna Testador). Pergunte o que for decisão de produto. Ao terminar, ponha o rótulo `ready` e tire o `roadmap` (o `bug` fica).
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
2. Branch `<branch curto>`, saído do `epic/<nome>` atualizado. PR com base `epic/<nome>`, título "<código> — <título>", corpo começando com "Parte de #<fase>" e as seções de sempre (Resumo, Como testar, Decisões tomadas, Impacto no DS, Impacto nos agentes).
3. Subagentes e esforço: <da sub-issue, ex.: Sonnet medium; mecânicos Haiku low>.
4. Todo briefing de mudança de comportamento ou correção segue a regra "teste primeiro" do `CLAUDE.md` ("Uso de modelos"): teste visto falhando antes do código, e o subagente devolve o nome dele e a falha.
5. Antes do PR: `npm run lint && npm run typecheck && npm test && npm run build`.
6. Acompanhe o PR (`subscribe_pr_activity`) e corrija o CI. Com o CI verde, mescle o PR no épico, marque os checkboxes e feche a sub-issue (`completed`).
7. Avise o coordenador por `send_message`: o link do PR mesclado, um resumo de 5 a 10 linhas, as decisões tomadas fora da sub-issue e os "Defeitos pendentes" (ou "Defeitos pendentes: nenhum").
8. Decisão de produto que a sub-issue não cobre: não invente. Mande a pergunta e as opções ao coordenador por `send_message` e espere a resposta.
9. Defeito achado no caminho, fora do plano (CLAUDE.md, "Defeito achado durante a etapa"): se não pede decisão do dono e cabe no que a fase toca, corrija neste PR, com teste primeiro, e cite-o em "Corrigido fora do plano" no Resumo; se não cabe, liste-o nos "Defeitos pendentes" do aviso (o que acontece, onde, como reproduzir). Não abra issue `bug`, salvo para o que pede decisão do dono.
<Só na última fase: ponha o rótulo `mcp-rc` no PR.>

Coordenador: `<id da sessão do orquestrador>`
```

## Fase de correção

Com ❌ no relato **ou com defeito pendente** (os "Defeitos pendentes" dos avisos das fases e as observações do relato que são defeito e não pedem decisão do dono; CLAUDE.md, "Defeito achado durante a etapa"), o orquestrador cria uma sub-issue `step` de correção (com `parent_issue_number` da etapa, a lista dos achados com o link do comentário do relato, a dos defeitos pendentes com a origem de cada um e o aceite "os roteiros que falharam passam e cada defeito tem um teste que o cobre") e uma sessão filha com a mesma mensagem da fase, apontando essa sub-issue. Só uma correção por etapa: defeito achado depois dela vira issue `bug`. O que pede decisão do dono também vira issue `bug`, com a decisão e as opções no corpo, e entra no "ficou para depois" do fechamento. Na segunda falha, em achado de perda de dados, integridade do `mapping.json` ou segurança, ou se a correção pedir decisão de produto, o orquestrador chama o dono.

## Para o testador

O orquestrador acha o ambiente "Mapping - testes" com `list_environments` e cria a sessão com `create_session`, `source_url` do repositório e `source_revision` = `epic/<nome>`:

```text
Leia `docs/TESTING-NUVEM.md` e execute no modo dirigido: <roteiros da sub-issue da última fase>. Passada visual: <lista da sub-issue, ou "nenhuma">. Branch `epic/<nome>`, commit `<hash>`. Relato na sub-issue #<última fase>. Coordenador: `<id da sessão do orquestrador>`.
```

Reteste, depois da correção (R0 reduzido ao R0.1 e aos passos de que os achados dependem; passada visual só das janelas e dos diálogos dos achados). Os defeitos pendentes corrigidos entram pelos passos de roteiro que afetam; sem passo afetado, o teste automatizado da correção basta, e uma correção só de defeitos pendentes, sem passo de roteiro, dispensa o reteste:

```text
Leia `docs/TESTING-NUVEM.md` e execute no modo dirigido: os achados <números> do relato em <link do comentário><e os passos <lista> que as correções dos defeitos pendentes afetam>. Branch `epic/<nome>`, commit `<hash da correção>`. Relato na sub-issue #<fase de correção>. Coordenador: `<id da sessão do orquestrador>`.
```

## Rodada completa em 3 blocos

Quando a seção **Testador** da sub-issue da última fase pede a rodada completa, o orquestrador (o **coordenador**) cria **três** sessões do testador de uma vez, uma por bloco da tabela de [`docs/TESTING-NUVEM.md`](TESTING-NUVEM.md) ("Rodada completa em blocos"). Cada uma usa `list_environments` ("Mapping - testes"), `create_session` com `source_url` do repositório, `source_revision` = `epic/<nome>`, o mesmo commit nas três e o título "Testador — <alvo>, bloco <k> de 3". Mensagem do bloco `<k>` (1, 2 ou 3):

```text
Leia `docs/TESTING-NUVEM.md` e execute o modo completo, bloco <k> de 3. Passada visual: <lista da sub-issue, no bloco 2; "no bloco 2" nos blocos 1 e 3>. Branch `epic/<nome>`, commit `<hash>`. Relato na sub-issue #<última fase>. Coordenador: `<id da sessão do coordenador>`.
```

- **Conferência de reserva:** agenda um `send_later` de 60 min e só segue com os **três avisos** (um por bloco, cada um cita o bloco). Bloco que não avisou até lá: `get_session` (`status_bucket`) e `list_events`; com falha ou sessão parada, chama o dono.
- **Com os três avisos,** posta o resumo (abaixo) na mesma sub-issue. O coordenador não reescreve os relatos.
- **Com ❌,** o fluxo de sempre: uma fase de correção com os achados dos três blocos (códigos `k.n`, com o link do comentário de cada um) e o reteste dirigido numa sessão só, pelos achados `k.n`, na mensagem de reteste acima.

### Rodada avulsa (do dono)

O dono manda num chat Sonnet no modo **Auto**:

```text
Rode a rodada completa do testador em blocos no branch `<branch>`, commit `<hash>`. Resumo e relatos na issue #<N>.
```

Esse chat é o coordenador: cria os três blocos como acima (relato na issue `#<N>`, coordenador = o id dele), espera os três avisos, posta o resumo e, para cada ❌, abre uma issue `bug` com a busca de duplicadas do `CLAUDE.md` ("Bugs e evidência visual"), com a severidade e o link do relato. Não corrige nada e não abre fase de correção.

## Resumo da rodada em blocos

Um comentário curto na mesma sub-issue (ou issue), depois dos três avisos. O coordenador não reescreve os relatos: só soma e aponta para eles.

```markdown
## Rodada completa em blocos — resumo

Branch `<branch>`, commit `<hash>`.

| Bloco | ✅  | ❌  | não executado | Tempo             |
| ----- | --- | --- | ------------- | ----------------- |
| 1     | N   | N   | N             | <min>             |
| 2     | N   | N   | N             | <min>             |
| 3     | N   | N   | N             | <min>             |
| Total | N   | N   | N             | <soma dos blocos> |

- **Achados por severidade:** bloqueia N, alta N, média N, baixa N.
  - <k.n> — <título> — <severidade> — <link do comentário>
- **Tempo:** soma dos blocos <min>; tempo de parede <min> (da criação do primeiro bloco ao último aviso). Os tempos de cada bloco são os do relato ("Tempo por roteiro"); sem o dado, "tempo não medido".
- **Relatos:** bloco 1 <link>, bloco 2 <link>, bloco 3 <link>.

<rodapé de atribuição>
```

## Notificação final

`PushNotification`, depois do fechamento:

```text
Etapa #<etapa> pronta: <resumo em uma linha>. PR do épico: <link>. Responda "pode mesclar" no chat.
```
