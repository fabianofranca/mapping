# Fluxo automatizado — mensagens prontas

As regras estão no `docs/PROCESS.md` ("Fluxo automatizado"); aqui ficam só as mensagens. Os trechos `<…>` são lacunas a preencher.

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

Para detalhar de uma vez todas as `roadmap` e `bug` que ainda não estão `ready` (num chat no modo Auto): `/detalhar-backlog`. O skill (`.claude/skills/detalhar-backlog/SKILL.md`) cria um subagente Opus (ferramenta `Agent`, em segundo plano) que propõe juntar issues num épico só, para ter menos versões do MCP e uma rodada do testador só. Depois cria até 3 subagentes Opus de detalhamento por vez e traz as perguntas deles ao dono pelo seletor de perguntas, sempre com uma opção recomendada; as respostas voltam ao mesmo subagente por `SendMessage`. Como a ferramenta `Agent` aceita `effort`, cada unidade roda em esforço high quando os critérios da skill a apontam (schema ou formato, gravação do `mapping.json`, arquitetura transversal, plano grande) e em medium nos outros casos (`alto=#a,#b` força high, `alto=nenhum` põe tudo em medium), sem prompt manual para o dono. Antes de gravar o plano, cada detalhamento o confere contra o código da `main` (arquivos, versões, roteiros, fases do tamanho de uma sessão e sobreposição com as outras `ready` e `in-progress`). Cada etapa sai com a linha `**Depende de:**`, que dá a ordem da implementação.

3. Implementação (no modelo da linha Orquestrador, no modo Auto):

```text
Implemente a etapa #<etapa> no fluxo automatizado. Me chame só para confirmar o merge.
```

Para confirmar o merge final, o dono responde no chat de implementação: `pode mesclar`.

Para implementar em sequência todas as `ready` (num chat Sonnet no modo Auto): `/implementar-fila`. O skill (`.claude/skills/implementar-fila/SKILL.md`) ordena a fila pela linha `**Depende de:**`, pela severidade e pelo impacto, mostra a ordem e então faz, etapa por etapa, o papel deste orquestrador: fases, testador, correções até zerar os ❌ (a decisão do dono vira `bug` e a fila segue) e fechamento. O painel "Fila de desenvolvimento" é atualizado a cada aviso, e as leituras pesadas do GitHub vão por subagente, para o coordenador durar mais horas. O merge de cada épico é pedido ao dono pelo seletor de perguntas, salvo quando ele escreve `mesclar=auto` na chamada. Outros argumentos: `paralelo=N` (padrão 2, com arquivos disjuntos), `modelo=tabela`, `sem-confirmar` e `painel=<url>|novo` (sem ele, o skill reaproveita o painel "Fila de desenvolvimento" de antes). Quando o contexto passa de 60%, o coordenador passa a fila a uma sessão nova (`retomar`).

Depois do merge, o orquestrador confere a Release do MCP: acha a execução do "MCP release" do commit do merge (`actions_list`), espera por ela (`send_later` de 15 min) e, com versão nova, confere que `mcp-v<versão>` existe (`get_release_by_tag`), não é pre-release, traz `mapping-mcp.js`, `setup.sh`, `SKILL.md`, `AGENTS.mapping.md` e `watch-comments.mjs` (cada um com o `.sha256`) e que as rc da versão sumiram; sem versão nova, que o `release` foi pulado. Em falha, ou com a execução ausente, notifica o dono com o link da execução e o plano B manual do `docs/MCP.md`. O resultado entra no comentário de fechamento e na notificação final.

## Para a sessão da fase

O orquestrador cria a sessão com `create_session`: `model` da tabela, `source_url` do repositório, `source_revision` = `epic/<nome>`, nunca `permission_mode: plan`. Mensagem:

```text
Você é o agente da fase <código> — <título> da etapa #<etapa> do repositório `fabianofranca/mapping`, no fluxo automatizado (docs/PROCESS.md, "Fluxo automatizado"). Ninguém está olhando esta sessão: não pergunte nada ao dono.

1. Leia o `CLAUDE.md`, o `docs/PROCESS.md`, a issue #<etapa> com os comentários e a sub-issue #<fase>, que é o seu plano. Siga-a; não reabra decisões já tomadas.
2. Branch `<branch curto>`, saído do `epic/<nome>` atualizado. PR com base `epic/<nome>`, título "<código> — <título>", corpo começando com "Parte de #<fase>" e as seções de sempre (Resumo, Como testar, Decisões tomadas, Impacto no DS, Impacto nos agentes).
3. Subagentes e esforço: <da sub-issue, ex.: Sonnet medium; mecânicos Haiku low>.
4. Todo briefing de mudança de comportamento ou correção segue a regra "teste primeiro" do `docs/PROCESS.md` ("Uso de modelos"): teste visto falhando antes do código, e o subagente devolve o nome dele e a falha.
5. Antes do PR: `npm run lint && npm run typecheck && npm test && npm run build`.
6. Acompanhe o PR (`subscribe_pr_activity`) e corrija o CI. Com o CI verde, mescle o PR no épico, marque os checkboxes e feche a sub-issue (`completed`).
7. Avise o coordenador por `send_message`: o link do PR mesclado, um resumo de 5 a 10 linhas, as decisões tomadas fora da sub-issue e os "Defeitos pendentes" (ou "Defeitos pendentes: nenhum").
8. Decisão de produto que a sub-issue não cobre: não invente. Mande a pergunta e as opções ao coordenador por `send_message` e espere a resposta.
9. Defeito achado no caminho, fora do plano (docs/PROCESS.md, "Defeito achado durante a etapa"): se não pede decisão do dono e cabe no que a fase toca, corrija neste PR, com teste primeiro, e cite-o em "Corrigido fora do plano" no Resumo; se não cabe, liste-o nos "Defeitos pendentes" do aviso (o que acontece, onde, como reproduzir). Não abra issue `bug`, salvo para o que pede decisão do dono.
<Só quando a linha da fase pede coordenador high, xhigh ou max: 10. Revisão de código: depois dos gates e antes do push do PR, rode a skill `/code-review <nível da tabela> <base>..HEAD`, com `<base>` = `git merge-base origin/epic/<nome> HEAD`, sem `--comment` nem `--fix`. Cada achado segue esta regra: defeito que se confirma lendo o código, corrija no próprio PR, com teste primeiro (docs/PROCESS.md, "Defeito achado durante a etapa"); simplificação ou eficiência dentro do que a fase toca, aplique; o resto, descarte, com o motivo. Depois das correções, rode os gates de novo. O Resumo do PR ganha a linha "Revisão `/code-review <nível>`: N achados, X corrigidos, Y aplicados, Z descartados (motivos)".>
<Só na última fase: ponha o rótulo `mcp-rc` no PR.>

Coordenador: `<id da sessão do orquestrador>`
```

## Fase de correção

Com ❌ no relato **ou com defeito pendente** (os "Defeitos pendentes" dos avisos das fases e as observações do relato que são defeito e não pedem decisão do dono; docs/PROCESS.md, "Defeito achado durante a etapa"), o orquestrador cria uma sub-issue `step` de correção (com `parent_issue_number` da etapa, a lista dos achados com o link do comentário do relato, a dos defeitos pendentes com a origem de cada um e o aceite "os roteiros que falharam passam e cada defeito tem um teste que o cobre") e uma sessão filha com a mesma mensagem da fase, apontando essa sub-issue. Só uma correção por etapa: defeito achado depois dela vira issue `bug`. O que pede decisão do dono também vira issue `bug`, com a decisão e as opções no corpo, e entra no "ficou para depois" do fechamento. Na segunda falha, em achado de perda de dados, integridade do `mapping.json` ou segurança, ou se a correção pedir decisão de produto, o orquestrador chama o dono.

## Para o testador

O orquestrador acha o ambiente "Mapping - testes" com `list_environments` e cria a sessão com `create_session`, `source_url` do repositório e `source_revision` = `epic/<nome>`:

```text
Leia `docs/TESTING-NUVEM.md` e execute no modo dirigido: <roteiros da sub-issue da última fase>. Passada visual: <lista da sub-issue, ou "nenhuma">. Branch `epic/<nome>`, commit `<hash>`. Relato na sub-issue #<última fase>. Tag da release: <mcp-v…-rc.n, ou "sem R21">. R0 inteiro primeiro. Coordenador: `<id da sessão do orquestrador>`.
```

A lacuna da tag é sempre preenchida: se a lista traz o R21 (testa a release real), a rc do épico (`mcp-v<versão>-rc.<n>`); se não traz, `sem R21`.

Reteste, depois da correção (R0 só o R0.1 e os passos de que os achados dependem; passada visual só das janelas e dos diálogos dos achados). Os defeitos pendentes corrigidos entram pelos passos de roteiro que afetam; sem passo afetado, o teste automatizado da correção basta, e uma correção só de defeitos pendentes, sem passo de roteiro, dispensa o reteste:

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

- **Agendamento "CR por épico"**, todo dia às 02:50 (America/Sao_Paulo). Ele dispara na **sessão coordenadora** ("CR — coordenador (não arquivar)"), não numa sessão nova: a sessão aberta direto por um agendamento nasce sem o repositório e recebe 403 da API do GitHub, e o `add_repo` não existe nela. Se a coordenadora for arquivada, o agendamento para de funcionar.
- **A coordenadora** lista os PRs de `epic/*` mesclados na `main` depois do ponto base (2026-11-08T15:05:07Z, commit `4532e75`), pula os que já têm a issue "CR épico <nome> (PR #N)" com o rótulo `code-review` e cria até 3 sessões revisoras por noite (`create_session` com `source_url` do repositório, Sonnet). As que sobram ficam para a noite seguinte. Sem épico novo, não faz nada.
- **Cada revisor** lê o diff do épico (`git diff <merge>^1 <merge>`), o PR e a issue da etapa, e avisa a coordenadora por `send_message`. Com todos os avisos da noite, a coordenadora notifica o dono com os links, os achados, os `bug` e o custo.
- **O prompt do agendamento** guarda uma cópia da mensagem do revisor abaixo. Quem muda uma muda a outra (`update_trigger` no "CR por épico").

### Limitações conhecidas

- O `/code-review` só serve com um diff. Para revisar arquivos inteiros (como no CR base), o revisor lê os arquivos; num diff, se a skill devolver achados de arquivos fora dele, eles são descartados.
- Use a API REST: `gh api -X POST repos/fabianofranca/mapping/issues …`. `gh issue create`, `gh repo clone` e GraphQL falham nessas sessões. Na busca, escreva `-X GET`, porque `gh api` com `-f` vira POST.
- Os defeitos high e medium são conferidos lendo o código, não executando a app; os low não são reconferidos.

### CR base (2026-11-08)

Revisão única da `main` inteira no commit `4532e7519cc06c9adf849ee254be1ed636f783a9`, em 6 blocos paralelos (cerca de 120 mil linhas de produção, US$ 46 equivalentes, 30 minutos): #945 (`src/model/`), #954 (`src/ui/`), #940 (`src/canvas/` e `src/store/`), #965 (`mcp/`), #971 (`src/app/`, `src/storage/`, `src/utils/`, `viewer/`, `pwa/`, `scripts/` e `.github/`) e #964 (`src/i18n/` e `src/theme/`). É o ponto de partida do "CR por épico".

### Para o revisor do CR por épico

```text
Você é o revisor do CR por épico do repositório fabianofranca/mapping: épico `epic/<nome>`, PR #<pr>, commit de merge `<sha>`. Ninguém está acompanhando: não faça perguntas. Leia o CLAUDE.md e o docs/PROCESS.md antes de começar.

Esta revisão é SOMENTE LEITURA no código: não corrija nada, não faça commit nem push, não abra PR, não comente PRs. O único efeito permitido são issues novas e comentários em issues `bug` existentes.

1. O código revisado é o diff do épico: `git fetch origin main && git diff <sha>^1 <sha>` (o que o épico mudou em relação à `main` daquele momento). Leia a descrição do PR #<pr> e a issue da etapa ("Closes #N"), com as sub-issues das fases, para saber a intenção e as decisões. Arquivos inteiros só para contexto.
2. Diff até 3 mil linhas de produção: revise com a skill `/code-review` no nível high, alvo `<sha>^1..<sha>` (sem --comment e sem --fix); se a skill devolver achados de arquivos fora do diff, descarte-os e revise lendo o diff. Maior que isso: divida por área em pedaços de até 3 mil linhas, um subagente Sonnet por pedaço (até 5 em paralelo, esforço high), cada um revisando o diff do seu pedaço (`git diff <sha>^1 <sha> -- <arquivos>`) com os arquivos inteiros para contexto. Testes: só para entender a intenção e apontar caso não coberto de comportamento novo. Procure: defeitos de corretude e regressões; violações das regras de arquitetura e de código do CLAUDE.md (model sem API de navegador, mutação fora de action do store, Konva fora de src/canvas, consulta por id fora do projectIndex, string de UI fora de t(), valor de design fora dos tokens, regras de CSP, complexidade acima de 10 fora das supressões); simplificação, reuso e eficiência. Cada achado: arquivo:linha, o que está errado ou pode melhorar, categoria (defeito, simplificação, eficiência, estilo), severidade (high, medium ou low, conforme o CLAUDE.md) para defeito, e o trecho que sustenta.
3. Confirme cada defeito lendo o código no commit `<sha>` (você ou um subagente de conferência, esforço high). Descarte o que não se sustentar.
4. Crie UMA issue "CR épico <nome> (PR #<pr>)" com os rótulos `roadmap` e `code-review`, exatamente um rótulo `impact:` e a linha `Impacto: <nível> — <porquê>` (seção "Impacto" do `docs/PROCESS.md`). O corpo, em pt-BR, traz o épico, o PR, a issue da etapa, o commit e os achados numerados e agrupados por arquivo, cada um com o link `https://github.com/fabianofranca/mapping/blob/<sha>/<arquivo>#L<linha>`, o que é, a categoria e a severidade (para defeito). Sem achados, a issue diz "sem achados". Termine o corpo, antes do rodapé, com `<!-- cr-epic: pr=<pr> sha=<sha> -->`.
5. Para cada DEFEITO CONFIRMADO de severidade high ou medium, siga "Bugs e evidência visual" do `docs/PROCESS.md`: procure duplicadas nas issues abertas e fechadas (inclusive as com o rótulo `code-review`); sem duplicada, crie uma issue `bug` com os rótulos `bug`, `code-review` e exatamente um rótulo de severidade, e o corpo completo (o que acontece, o esperado e de onde vem, passos para reproduzir, commit, origem com o link da issue da rodada e do PR, severidade e porquê, "Duplicadas: nenhuma (busca: <termos>)"); com duplicada ou agrupável, comente nela. Defeitos low ficam só na issue da rodada. Na issue da rodada, aponte cada `bug` criado ou comentado.
6. GitHub só pela API REST: `gh api -X POST repos/fabianofranca/mapping/issues -f title=... -f body=... -f 'labels[]=...'` e `gh api -X POST repos/fabianofranca/mapping/issues/<n>/comments -f body=...`. `gh issue create`, `gh repo clone` e GraphQL não funcionam nesta sessão. Busca: `gh api -X GET search/issues -f q='repo:fabianofranca/mapping is:issue <termos>'` (com `-X GET` explícito; sem ele o `-f` vira POST).
7. Todo texto no GitHub termina com o rodapé: linha `---` e `_Generated by [Claude Code](https://claude.ai/code)_`.
8. Ao terminar (ou se travar), avise o coordenador por `send_message` (session_id <id da coordenadora>) com: link da issue, total de achados por categoria, os `bug` criados ou comentados, e o que falhou. Coordenador: `<id da coordenadora>`.
```
