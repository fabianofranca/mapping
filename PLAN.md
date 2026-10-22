# Mapping — Plano de desenvolvimento

> Este documento guarda o resumo do produto e **só as fases pendentes** (hoje nenhuma etapa em andamento; a Marcações espaciais, notas e setas foi a última concluída e, até o épico entrar na `main`, o fim do documento ainda guarda a execução em cascata e o texto da ME5). Ao concluir uma tarefa, marque o checkbox correspondente no mesmo PR.

## Produto

Aplicação web para mapear áreas de imagens com **marcações retangulares**, organizar informações em **camadas** e registrar **anotações** (pares chave-valor livres ou anotações **tipadas** definidas por uma **especialização**). Tudo é salvo num `mapping.json` ao lado das imagens (pasta ou zip), num formato pensado para ser lido por um agente de IA, que deve conseguir recortar, na imagem original, a área exata de cada marcação.

Estado: **etapas 1 a 2.5, 3a (servidor MCP, base), 3b (referências de código), 4 (propostas de alteração com revisão), 5 (pré-voo para uso real), 6 (correções da primeira rodada de testes), 7 (correções da rodada dirigida), 8 (consolidação por subsistema), 9 (ajustes do teste manual avançado; schema v9 e servidor MCP 0.4.0) e 10 (correções da rodada dirigida da etapa 9) concluídas**, além do laboratório de componentes e da etapa **Biblioteca** (schema v10; servidor MCP 0.5.0). O dono fez uso real grande e considerou o marco "Uso real" **alcançado em 2026-10-16**: a ferramenta já serve e a prioridade passou à biblioteca de componentes, hoje entregue. O **laboratório de componentes** está concluído (épico `epic/lab` mesclado em 2026-10-17; descrição em [`lab/README.md`](lab/README.md), histórico em [`docs/history/PLAN-etapa-lab.md`](docs/history/PLAN-etapa-lab.md)). A etapa **Biblioteca** (épico `epic/biblioteca`, fases B1 a B5 e Fechamento) está concluída, testada pelo Cowork e mesclada na `main` (PR #180, tag `mcp-v0.5.0`; histórico em [`docs/history/PLAN-etapa-biblioteca.md`](docs/history/PLAN-etapa-biblioteca.md)). A etapa **Código de instanciação** (épico `epic/instanciacao`, fases C1 a C4; especialização `formatVersion` 5, schema v11, MCP 0.6.0) está concluída e testada pelo Cowork e pelo dono no Claude Code; épico mesclado na `main`, com a tag estável `mcp-v0.6.0` (histórico em [`docs/history/PLAN-etapa-instanciacao.md`](docs/history/PLAN-etapa-instanciacao.md)). A etapa **Canvas limpo** (épico `epic/canvas-limpo`, fases V1 e V2; sem schema, formato nem MCP novos) está concluída: o cartão de texto do zoom semântico saiu do canvas e o **Ver limpo** (`Alt+H`) mostra só as imagens e os componentes (histórico em [`docs/history/PLAN-etapa-canvas-limpo.md`](docs/history/PLAN-etapa-canvas-limpo.md)). A etapa **Container** (épico `epic/container`, fases CN1 e CN2; schema v12, especialização `formatVersion` 6, proposta `formatVersion` 2 e MCP 0.8.0) está concluída: o objeto de topo do canvas passou a se chamar container (interface, MCP, propostas e `mapping.json`, com `containers` e `containerId`) e os presets de dispositivo saíram do núcleo para a especialização (histórico em [`docs/history/PLAN-etapa-container.md`](docs/history/PLAN-etapa-container.md)). A etapa **Marcações espaciais, notas e setas** (épico `epic/marcacoes-espaciais`, fases ME0 a ME5; schema v13, especialização `formatVersion` 7, proposta `formatVersion` 3 e MCP 0.9.0 ao fim) está concluída (PRs #208 a #211, #214 e o da ME5): marcações que pertencem ao canvas e envolvem containers, pertencimento resolvido pela geometria e gravado, seleção múltipla e arrasto conjunto, biblioteca de notas embutida, setas como marcações que apontam e tabelas flutuantes, tudo exposto pelo MCP 0.9.0 (histórico em [`docs/history/PLAN-etapa-marcacoes-espaciais.md`](docs/history/PLAN-etapa-marcacoes-espaciais.md)). O `index.html` é um único arquivo autocontido (funciona em `file://` e no GitHub Pages), **só desktop** (largura mínima de 900 px), com tema claro/escuro e pt-BR/en-US.

## Documentação

| Documento                                                | Conteúdo                                                                       |
| -------------------------------------------------------- | ------------------------------------------------------------------------------ |
| [`README.md`](README.md)                                 | O que é, como rodar, testar, publicar e usar o preview                         |
| [`CLAUDE.md`](CLAUDE.md)                                 | Regras de trabalho e de arquitetura para o Claude Code                         |
| [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md)           | Camadas, fluxo de dados, regras (com o porquê) e onde fica cada coisa          |
| [`docs/GUIDE.md`](docs/GUIDE.md)                         | Guia interativo (`guia/`) e projeto de exemplo: geração, o que gravam, como mudar |
| [`docs/FORMAT.md`](docs/FORMAT.md)                       | Referência do `mapping.json` (schema v13)                                      |
| [`docs/PROPOSAL-FORMAT.md`](docs/PROPOSAL-FORMAT.md)     | Formato da proposta de alteração e regras da revisão (etapa 4)                 |
| [`docs/SPEC-FORMAT.md`](docs/SPEC-FORMAT.md)             | Formato do arquivo de especialização, `formatVersion` 1 a 7 (e `docs/spec.schema.json`): biblioteca, contrato de versão e validação |
| [`docs/COMPONENT-FORMAT.md`](docs/COMPONENT-FORMAT.md)   | Formato do arquivo de componente (`mapping-component`): nós, dimensionamento, expressões, avisos do motor |
| [`docs/component.schema.json`](docs/component.schema.json) | JSON Schema do arquivo de componente (documentação; o código é a fonte da verdade) |
| [`docs/MCP.md`](docs/MCP.md)                             | Servidor MCP: instalação, `.mcp.json`, raízes, tools, referências, problemas   |
| [`docs/AGENT-GUIDE.md`](docs/AGENT-GUIDE.md)             | Guia do agente: como usar as tools do servidor MCP (também servido como recurso) |
| [`docs/TESTING.md`](docs/TESTING.md) | Guia do testador: onde pegar a app, requisitos, mapa da interface, MCP, roteiros de teste manual, teste manual avançado (seção 9), templates do relato e do registro de uso real e os apêndices do agente e de disco |
| [`docs/TESTING-COWORK.md`](docs/TESTING-COWORK.md) | Prompt vivo do testador do Cowork (rodada completa ou dirigida; o agente lê o guia com o apêndice A) |
| [`docs/history/PLAN-etapas-1-2.md`](docs/history/PLAN-etapas-1-2.md) | Histórico: seções 1 a 13 do plano antigo (inclui o roteiro de teste manual 13.9, hoje R1 do `docs/TESTING.md`) |
| [`docs/history/PLAN-etapa-2-1.md`](docs/history/PLAN-etapa-2-1.md)   | Histórico: etapa 2.1, revisão técnica (achados, decisões e fases 18 a 25)       |
| [`docs/history/PLAN-etapa-2-2.md`](docs/history/PLAN-etapa-2-2.md) | Histórico: etapa 2.2, segunda revisão técnica (fases 26 e 27 concluídas; 28 dispensada) |
| [`docs/history/PLAN-etapa-2-3.md`](docs/history/PLAN-etapa-2-3.md) | Histórico: etapa 2.3, redesign da interface (fases R1 a R9 concluídas; R10 retirada do roadmap) |
| [`docs/history/PLAN-etapa-2-5.md`](docs/history/PLAN-etapa-2-5.md) | Histórico: etapa 2.5, trava de marcações e imagens (fases F1 a F6 concluídas) |
| [`docs/history/PLAN-etapa-3a.md`](docs/history/PLAN-etapa-3a.md) | Histórico: etapa 3a, servidor MCP base (fases 3a.1 a 3a.6 concluídas) |
| [`docs/history/PLAN-etapa-3b.md`](docs/history/PLAN-etapa-3b.md) | Histórico: etapa 3b, referências de código (fases 3b.1 a 3b.5 concluídas; inclui o roteiro de teste manual da 3b) |
| [`docs/history/PLAN-etapa-4.md`](docs/history/PLAN-etapa-4.md) | Histórico: etapa 4, propostas de alteração com revisão (fases 4.0 a 4.5 concluídas; inclui o roteiro de teste manual da etapa 4) |
| [`docs/history/PLAN-etapa-5.md`](docs/history/PLAN-etapa-5.md) | Histórico: etapa 5, pré-voo para uso real (fases 5.1 a 5.9 concluídas; decisões consolidadas dos PRs; prompts do coordenador e do testador ao lado) |
| [`docs/history/PLAN-etapa-6.md`](docs/history/PLAN-etapa-6.md) | Histórico: etapa 6, correções da primeira rodada de testes (fases 6.1 a 6.7 concluídas; decisões consolidadas dos PRs; relato da rodada 1 e prompts do coordenador e do testador ao lado) |
| [`docs/history/PLAN-etapa-7.md`](docs/history/PLAN-etapa-7.md) | Histórico: etapa 7, correções da rodada dirigida (fases 7.1 a 7.4 concluídas; decisões consolidadas dos PRs; relato da rodada 2 e prompt do coordenador ao lado) |
| [`docs/history/PLAN-etapa-8.md`](docs/history/PLAN-etapa-8.md) | Histórico: etapa 8, consolidação por subsistema (fases 8.1 a 8.7 concluídas; decisões consolidadas dos PRs, auditoria e portão; ao lado, as notas de desenho em `docs/history/etapa-8-notas/`, a segunda leitura `auditoria-etapa-8.md` e o prompt do coordenador) |
| [`docs/history/PLAN-etapa-9.md`](docs/history/PLAN-etapa-9.md) | Histórico: etapa 9, ajustes do teste manual avançado (fases 9.1 a 9.7 concluídas; decisões consolidadas dos PRs; schema v9 e MCP 0.4.0) |
| [`docs/history/PLAN-etapa-10.md`](docs/history/PLAN-etapa-10.md) | Histórico: etapa 10, correções da rodada dirigida da etapa 9 (fases 10.1 e 10.2 concluídas; decisões consolidadas dos PRs #154 e #155 e do fechamento) |
| [`docs/history/PLAN-etapa-lab.md`](docs/history/PLAN-etapa-lab.md) | Histórico: laboratório de componentes, fases L1 e L2 concluídas; decisões registradas que a etapa Biblioteca herda |
| [`docs/history/PLAN-etapa-biblioteca.md`](docs/history/PLAN-etapa-biblioteca.md) | Histórico: etapa Biblioteca, fases B1 a B5 e Fechamento concluídas; decisões consolidadas dos PRs, rodada do Cowork do Fechamento (e reteste) e o que ficou para depois |
| [`docs/history/PLAN-etapa-instanciacao.md`](docs/history/PLAN-etapa-instanciacao.md) | Histórico: etapa Código de instanciação, fases C1 a C4 concluídas; decisões consolidadas dos PRs, rodada do Cowork e reteste, e o que ficou para depois |
| [`docs/history/PLAN-etapa-canvas-limpo.md`](docs/history/PLAN-etapa-canvas-limpo.md) | Histórico: etapa Canvas limpo, fases V1 e V2 concluídas; decisões consolidadas dos PRs |
| [`docs/history/PLAN-etapa-container.md`](docs/history/PLAN-etapa-container.md) | Histórico: etapa Container, fases CN1 e CN2 concluídas; decisões consolidadas dos PRs e o que ficou para depois |
| [`docs/history/PLAN-etapa-marcacoes-espaciais.md`](docs/history/PLAN-etapa-marcacoes-espaciais.md) | Histórico: etapa Marcações espaciais, notas e setas, fases ME0 a ME5 concluídas; decisões, regras de contenção, decisões consolidadas dos PRs, a cascata noturna e o que ficou para depois |
| [`docs/history/relato-2026-10-12-dirigida.md`](docs/history/relato-2026-10-12-dirigida.md) | Relato da rodada 2 (dirigida) do Cowork sobre o build `db5060d`; origem da etapa 7 |
| [`docs/history/relato-2026-10-12-dirigida-r3.md`](docs/history/relato-2026-10-12-dirigida-r3.md) | Relato da rodada 3 (dirigida) do Cowork sobre o build `2bdb662`; confirma a etapa 7 sem achados |
| [`docs/history/relato-2026-10-12-dirigida-r4.md`](docs/history/relato-2026-10-12-dirigida-r4.md) | Relato da rodada 4 (dirigida) do Cowork sobre o build `48f8e32`; observações O1 a O9, citadas no aceite das fases 8.2 e 8.4 |
| [`docs/history/relato-2026-10-13-portao.md`](docs/history/relato-2026-10-13-portao.md) | Relato da rodada 5 (completa, portão da etapa 8) do Cowork sobre o build `e701862`; achados devolvidos às fases 8.2, 8.4 e 8.5 |
| [`docs/history/relato-2026-10-14-dirigida.md`](docs/history/relato-2026-10-14-dirigida.md) | Relato da rodada 6 (dirigida) do Cowork sobre o build `1710ed5`; confirma as devoluções do portão e fecha a etapa 8 |
| [`docs/history/relato-2026-10-15-dirigida.md`](docs/history/relato-2026-10-15-dirigida.md) | Relato da rodada 7 (dirigida, etapa 9) do Cowork sobre o build `303b576`; 58 ✅, 1 achado baixo; origem da etapa 10 |
| [`docs/history/relato-2026-10-20-instanciacao.md`](docs/history/relato-2026-10-20-instanciacao.md) | Relato da rodada dirigida do Cowork sobre o build `dee8666` (etapa Código de instanciação): 54 ✅, 1 ❌ (R3.6a) |
| [`docs/history/relato-2026-10-20-instanciacao-reteste.md`](docs/history/relato-2026-10-20-instanciacao-reteste.md) | Reteste do R3.6a no Claude Code com a `mcp-v0.6.0-rc.2`: passou |
| [`docs/history/relato-2026-10-21-recorte-url.md`](docs/history/relato-2026-10-21-recorte-url.md) | Relato da rodada dirigida do Cowork sobre o épico `epic/recorte-url` (build `564b1e7`, MCP 0.7.0-rc.1): 35 ✅, nenhum achado |
| [`docs/history/revisao-tecnica-2026-10-12.md`](docs/history/revisao-tecnica-2026-10-12.md) | Revisão técnica dirigida (síntese e seis relatórios, 71 achados); origem da etapa 8 |
| [`docs/ROADMAP.md`](docs/ROADMAP.md) | Ordem das próximas etapas (etapas Container e Marcações espaciais, notas e setas concluídas), marco de uso real e evoluções |
| [`docs/redesign/HANDOFF.md`](docs/redesign/HANDOFF.md) | Redesign da interface (etapa 2.3, concluída; referência): componentes, tokens, mudanças B#, propostas P# e decisões |
| [`docs/redesign/HANDOFF-PROPOSALS.md`](docs/redesign/HANDOFF-PROPOSALS.md) | Design das propostas de alteração (fase 4.0): telas, componentes e tokens novos, comportamento, atalhos e pontos em aberto |
| [`docs/redesign/BRIEF-REVIEW-DETAILS.md`](docs/redesign/BRIEF-REVIEW-DETAILS.md) | Briefing para o Claude Design dos Detalhes na revisão (fase 9.1, concluída; referência): problema, estado atual, requisitos, restrições e os estados E1 a E17 |
| [`docs/redesign/HANDOFF-REVIEW-DETAILS.md`](docs/redesign/HANDOFF-REVIEW-DETAILS.md) | Design dos Detalhes na revisão (etapa 9, aprovado; referência): marcador e popover por campo, cabeçalho do item, “Outras mudanças”, comportamento, textos e decisões |

---

## Etapa — Marcações espaciais, notas e setas (concluída, épico `epic/marcacoes-espaciais`)

> Fases ME0 a ME5 entregues no épico (schema v13, especialização `formatVersion` 7, proposta `formatVersion` 3, componente `formatVersion` 2 e MCP 0.9.0). O objetivo, os conceitos, as 14 decisões, as regras de contenção, a revisão adversarial, as fases ME0 a ME4, as decisões consolidadas dos PRs e o que ficou para depois estão em [`docs/history/PLAN-etapa-marcacoes-espaciais.md`](docs/history/PLAN-etapa-marcacoes-espaciais.md). **Esta seção guarda só o que ainda serve de manhã até o épico entrar na `main`:** a "Execução em cascata" (o protocolo da noite e da manhã) e o texto da ME5; os dois também estão no histórico e saem daqui quando o épico entrar na `main`, deixando só o ponteiro.

### Execução em cascata (desenvolvimento noturno sem o dono)

O dono quer que as fases sejam desenvolvidas **em sequência, sem ele, durante a noite**, e testadas e mescladas por ele de manhã, uma a uma, com o Cowork. Para isso as fases não esperam o merge da anterior: cada uma nasce da ponta da anterior, e os PRs ficam **empilhados**. Esta seção é o contrato do agente que gerencia a noite e do agente que ajuda de manhã; o `PLAN.md` continua sendo a especificação, e nada aqui a muda.

**Pré-requisitos (o gerente confere antes de começar e para se algum faltar):**

- O plano desta etapa está no branch de partida (o PR #205 mesclado, ou o branch dele como ponto de partida).
- As sessões na nuvem instalam as dependências sozinhas pelo hook de SessionStart (`.claude/hooks/session-start.sh`, registrado em `.claude/settings.json`; só age em sessão remota, é idempotente e síncrono), então os gates rodam sem passo manual. O hook vale a partir do branch que o contém (o do PR #205); numa sessão aberta em branch anterior, `npm install` à mão.
- O épico Container está concluído e na `main`. Se não estiver, a cascata **começa pelo Container** (CN1 e CN2, sobre `epic/container`, pelas regras daquela etapa) e o `epic/marcacoes-espaciais` nasce da ponta do `epic/container`; quando o Container entrar na `main`, o épico novo recebe a `main` por merge (nunca rebase).
- Nenhuma fase começa com decisão aberta. Com as decisões da ME4 fechadas em 2026-10-22 (decisão 14), a noite cobre **ME0 → ME5**; se uma fase levantar uma decisão nova, a cascata para nela (abaixo). A ME5 nunca roda sem a ME4.

**Topologia dos branches e PRs.**

- `epic/marcacoes-espaciais` a partir da `main` (ou da ponta do `epic/container`, acima). O PR do épico para a `main` é aberto pelo dono (ou pelo agente da manhã) depois do primeiro merge nele: o GitHub não abre PR sem diferença, e a noite não mescla nada.
- Fase N no branch `me<N>/<nome>` (`me0/sem-heranca`, `me1/marcacao-do-canvas`, `me2/selecao-e-arrasto`, `me3/notas`, `me4/setas-e-tabelas`, `me5/mcp-e-fechamento`), criado da **ponta do branch da fase N-1** (a ME0, do épico). O PR da fase N tem **base no branch da fase N-1** (o da ME0, no épico), então mostra só a própria fase. Quando a fase N-1 é mesclada no épico e o branch dela apagado, o GitHub muda a base do PR N para o épico sozinho.
- O que isso custa: o `ci.yml` roda em todo PR, qualquer que seja a base, e em todo push fora da `main`, então cada PR da cascata tem CI; o preview é o do último PR atualizado, então de manhã cada fase é publicada à mão pelo Deploy (`workflow_dispatch` com o branch); o snapshot do MCP (`mcp-snapshot-pr<N>`) só nasce em PR com base num `epic/**`, logo a ME0 já o tem e as outras o ganham no primeiro push depois de a base virar o épico (o merge-forward da manhã, abaixo).

**O gerente da madrugada** (uma sessão em **Sonnet, esforço high**, decidido pelo dono em 2026-10-22: ele segue um protocolo fechado e **não executa fase nenhuma**, só cria uma sessão por fase, com o modelo certo, e acompanha; um modelo mais caro ali gastaria cota lendo log, e o esforço alto fica para as poucas decisões que salvam a noite, como distinguir uma CI vermelha da fase de uma falha de infraestrutura).

1. Lê o `CLAUDE.md`, esta seção e as fases; confere os pré-requisitos; abre a noite no **painel** (abaixo): a execução, as fases que a noite vai cobrir e o primeiro evento.
2. Para cada fase, em ordem: cria a sessão da fase com `create_session` do servidor `claude-code-remote`, com o **modelo coordenador da fase** (tabela acima), `source_url` do repositório, `source_revision` no branch da fase anterior, `outcome_branch` no branch da fase e o modo de permissão sem perguntas que o dono configurar; o prompt é o modelo abaixo. O esforço do coordenador vai **no prompt** (a ferramenta não o fixa) e a sessão o repassa aos briefings dos subagentes, lidos da tabela da fase.
3. Acompanha a sessão (`get_session`, `list_events`) sem interferir; quando ela termina, confere a entrega: branch publicado, PR aberto com a base certa, CI verde (ou o relato do que ficou vermelho e por quê), checkboxes da fase marcados no `PLAN.md`, descrição com Resumo, Como testar e Decisões tomadas. Dúvida que o plano não resolve aparece na descrição do PR, nunca vira comportamento inventado. Cada acontecimento (sessão criada, PR aberto, CI, rodada de correção, entrega) vira uma escrita no painel; enquanto a fase roda, a cada 15 minutos no máximo, o gerente atualiza a nota da fase com o que a sessão está fazendo.
4. Só então começa a fase seguinte, da ponta do branch recém-entregue.
5. **Para a cascata**, sem iniciar a próxima fase, quando: a fase passa do tempo (sugestão: 3 h; a ME1, 4 h); os gates continuam vermelhos depois de duas rodadas de correção da própria sessão; a sessão pede uma decisão que não está no plano; a próxima fase tem decisão aberta. A fase interrompida fica como está (branch publicado, PR em rascunho se não terminou), e o gerente deixa para a manhã um comentário no PR da última fase entregue (ou no PR #205, se nenhuma) com: fases entregues e seus PRs, o que parou e por quê, e o que a manhã precisa decidir. Registra a parada no painel (estado da execução, motivo e um evento).
6. **Nunca:** mesclar PR, mexer na `main` ou no épico além de criá-lo, apagar branch, rebase ou force-push, pular gate, pôr `mcp-rc` fora da ME5, implementar além da fase.

**Painel da noite** (pedido do dono em 2026-10-22): um painel ao vivo, aberto a qualquer hora pelo celular, que diz em que fase a noite está, quanto tempo cada fase levou, há quanto tempo a atual roda, os PRs e um diário. É o artefato **[Cascata noturna do Mapping](https://claude.ai/artifact/BWeCqicAbAouMKWHRVxq5t)** (privado do dono; a página já existe e o gerente **não a republica**). O gerente só **grava dados** no banco do artefato, com a ferramenta `ArtifactData` (`url` do painel; carregue-a com `ToolSearch` se não estiver na lista), e a página se atualiza sozinha para quem a tem aberta; os tempos "há X" são calculados na página a partir dos horários gravados.

- **Documentos** (horários em ISO 8601 com fuso, o `toISOString()` de JavaScript):
  - `cascade/state`: `{ currentRunId, updatedAt }`. Lido antes de escrever (`get`, para o `if_version`); `currentRunId` aponta a execução da noite.
  - `runs/<runId>` (`runId` = data da noite, `AAAA-MM-DD`, com sufixo `-2` se houver outra no mesmo dia): `{ id, status: "running" | "stopped" | "done", startedAt, endedAt?, startBranch, managerSessionId?, currentPhase?, stopReason?, summary?, note?, updatedAt }`.
  - `runs/<runId>/phases/<FASE>` (`CN1`, `CN2`, `ME0` … `ME5`): `{ id, order, title, model, effort, status: "pending" | "running" | "fixing" | "delivered" | "stopped" | "skipped" | "merged", startedAt?, endedAt?, branch?, prNumber?, prUrl?, sessionId?, ci?: "pending" | "green" | "red" | "none", note?, updatedAt }`. `note` é uma frase sobre o que a sessão está fazendo agora.
  - `runs/<runId>/events/<id>` (`id` = horário ISO com `:` e `.` trocados por `-`, mais um sufixo curto): `{ at, phase?, kind: "info" | "ok" | "warn" | "stop", text }`. Uma frase por acontecimento; nunca o log inteiro.
- **Quando gravar** (um `batch` por acontecimento, com `if_version` nos documentos já lidos):
  1. Ao começar: `runs/<runId>` em `running`, todas as fases que a noite vai cobrir em `pending` (com `order`, `title`, `model` e `effort` da tabela da etapa), `cascade/state` apontando para a execução, e um evento "Noite começou a partir de <branch>".
  2. Ao criar a sessão de uma fase: a fase em `running` com `startedAt`, `sessionId` e `branch`; `currentPhase` na execução; evento.
  3. Ao ver PR aberto, CI (verde ou vermelho), rodada de correção da própria sessão (`fixing`), entrega (`delivered`, `endedAt`): o campo correspondente na fase; evento.
  4. Enquanto a fase roda, **a cada 15 minutos no máximo**: `note` da fase com o que a sessão está fazendo (lido de `list_events`) e `updatedAt` da execução; evento só se algo mudou. Se a execução ficar mais de 30 minutos sem `updatedAt`, o painel mostra "sem sinal do gerente".
  5. Ao parar ou terminar: `status` da execução (`stopped` ou `done`), `endedAt`, `stopReason` ou `summary` (uma frase: fases entregues e onde parou); a fase interrompida em `stopped`; evento `stop`.
  6. De manhã, o agente de apoio marca cada fase mesclada no épico como `merged` (opcional; o resto o dono vê no GitHub).
- **Custo e falha:** nunca mais de uma escrita por acontecimento e uma por 15 minutos; nada de reescrever a página. Se a ferramenta não existir na sessão ou a escrita for recusada, o gerente avisa no relato da manhã e segue sem o painel: o painel nunca para a cascata.

**Prompt da sessão de uma fase** (o gerente preenche os colchetes):

```
Você é o coordenador da fase [ME_N] da etapa Marcações espaciais, notas e setas.
Leia o CLAUDE.md e, no PLAN.md, a seção da etapa inteira (conceitos, decisões,
regras de contenção, o que quebra, execução em cascata) e a sua fase. Confira o
modelo em que roda (regra "Uso de modelos" do CLAUDE.md): esta fase pede [modelo],
esforço [esforço]; subagentes conforme a tabela da fase. Trabalhe no branch
[me_N/nome], criado a partir de [branch anterior]; nunca toque na main nem no
épico. Entregue: a fase inteira (código, testes, docs e roteiros que ela lista);
os gates verdes (npm run lint && npm run typecheck && npm test && npm run build,
mais build:mcp, build:example e build:guia onde a fase tocar); os checkboxes da
fase marcados no PLAN.md; o PR com base [branch anterior], ready for review, com
Resumo, Como testar (dizendo que o preview da fase é publicado pelo
workflow_dispatch do Deploy com este branch) e Decisões tomadas, e dizendo que
faz parte da cascata noturna. Rótulo mcp-rc só na ME5. Dúvida que o plano não
resolve: registre no PR e siga a leitura mais simples; se ela bloquear a fase,
pare com o que está verde e relate no PR. Não mescle nada.
```

**A manhã** (o dono, o Cowork e um agente de apoio), fase a fase, na ordem:

1. Publicar o branch da fase N no preview (Deploy › `workflow_dispatch` com o branch) e rodar o Cowork nos roteiros que a fase lista (R12 e os que ela toca). Para o MCP, usar o `mcp-snapshot-pr<N>` quando existir (ME0 de saída; as outras depois do primeiro merge-forward).
2. Achados viram correções no próprio branch da fase, por uma sessão com o modelo da fase; o Cowork reconfere o que mudou.
3. O dono mescla o PR N no épico e apaga o branch (o GitHub muda a base do PR N+1 para o épico).
4. **Merge-forward:** o agente de apoio mescla o épico no branch da fase N+1 (`git merge`, nunca rebase), resolve conflitos no branch que recebe, roda os gates, publica; depois mescla N+1 em N+2, e assim até o último branch da cascata. Assim cada PR continua mostrando só a própria fase, e as correções da manhã chegam a todas as fases seguintes. Se um merge quebrar os testes de uma fase seguinte (a correção mudou um comportamento de que ela dependia), a correção é feita naquele branch, dentro do escopo daquela fase.
5. Repetir com a fase N+1. No fim, a ME5 (quando existir) leva o rótulo `mcp-rc`, e o épico vai para a `main` pelo PR do épico, como sempre.

**O que a cascata troca:** tempo por risco. As fases da noite são construídas sobre fases ainda não testadas; um achado da manhã na ME1 pode exigir retrabalho na ME2 e na ME3 além do merge-forward. Por isso o gerente para na primeira fase que não fecha verde, em vez de empilhar sobre ela, e a manhã segue a ordem.

**Prompt de abertura do gerente** (o dono cola numa sessão nova em Sonnet, esforço high; o gerente não executa fases, só as cria com o modelo de cada uma):

```
Gerencie a cascata noturna da etapa Marcações espaciais, notas e setas:
leia o CLAUDE.md e a seção "Execução em cascata" do PLAN.md e siga o
protocolo do gerente da madrugada, fase a fase, a partir de [branch de
partida], parando onde o protocolo manda parar. Alimente o painel da
noite a cada acontecimento, como manda a seção "Painel da noite". Não
mescle nada.
```

### Fases

#### ME5 — MCP, guia do agente e fechamento

**Coordenador:** Sonnet. Implementação a partir do formato fechado nas fases anteriores. **Esforço:** medium; subagentes medium; mecânicos Haiku low.

**Toca em:** `mcp/version.ts` (0.9.0), `mcp/views.ts`, `mcp/markingList.ts`, `mcp/items.ts` (`container: null`, `space`, `floating`, `members` e `arrows` em `get_marking`, caminho "Canvas › …", filtro `canvas` em `list_markings`, `parent` e `members` em `get_container`, contagens de marcações do canvas, flutuantes e setas em `get_project`; opcional, o `rect` também em fração do container, para o agente comparar entre telas), `mcp/operations.ts` e `mcp/batch.ts` (`create_marking` sem `container` e com `near`, da ME4; `update_marking` com `container` novo e `rect` nos pixels dele; `floating`; `parent` com aviso; `create_arrow`, `update_arrow` e `delete_arrow` da ME4 documentados; `points` de seta nunca escritos pelo lote), `mcp/imageTools.ts` (`canvas-marking` e `arrow` em `get_marking_image`, com `hint`), `mcp/errors.ts` e a seção "Erros" do `docs/AGENT-GUIDE.md` (`tests/mcp/errorCodes.test.ts`), `mcp/tools.ts` (`create_project` com `notes`), `docs/MCP.md` ("Mudança da 0.9.0"), `docs/AGENT-GUIDE.md` (conceitos: os três mundos, visual, marcações e anotações, e a seta como marcação que aponta (decisão 14); espaços; pertencimento lido em `parent`/`members`, nunca calculado; notas e tabelas flutuantes; setas lidas em `arrows` de `get_marking` e anotadas como qualquer marcação, e o padrão "flutuante que aponta"; o que mudou), `examples/workspace/` (`AGENTS.md`, skill), `.claude/skills/spec-author/`, `docs/TESTING.md` (R12.23 a R12.27, pelo cliente stdio: `get_marking` de uma marcação do canvas com `members` e `arrows`, `create_marking` no canvas numa proposta, `create_arrow` com anotação na seta, `get_marking_image` recusando, `create_project` com e sem `notes`), `tests/mcp/*`; fechamento: `docs/history/PLAN-etapa-marcacoes-espaciais.md` (com as decisões consolidadas dos PRs), `PLAN.md`, `docs/ROADMAP.md`, `CLAUDE.md`.

- [x] MCP 0.9.0: `get_marking`, `list_markings`, `get_container` e `get_project` expõem espaço, pai, membros, `floating` e setas; `create_marking` no canvas; `update_marking` troca de container; `parent` aceito com aviso; `get_marking_image` recusa a marcação do canvas (`canvas-marking`) e a seta (`arrow`); `create_project` com `notes`; testes por stdio
- [x] `docs/AGENT-GUIDE.md` e `docs/MCP.md` com os três mundos, o pertencimento lido (nunca calculado), as notas e as tabelas, as setas como marcações e a mudança da 0.9.0; `examples/workspace/` e a skill `spec-author` em dia
- [x] Rótulo `mcp-rc` no PR; snapshot testado pelo cliente stdio
- [x] R12.23 a R12.27 no `docs/TESTING.md` (a rodada dirigida do Cowork fica a critério do dono)
- [x] Fechamento: histórico em `docs/history/PLAN-etapa-marcacoes-espaciais.md` (com as decisões consolidadas dos PRs e o que ficou para depois), `PLAN.md` sem etapa em andamento, `docs/ROADMAP.md` e `CLAUDE.md` atualizados

**Aceite:** pelo cliente stdio, o agente lê uma marcação do canvas com os membros e as setas, cria outra numa proposta que a app aplica, cria uma seta e a anota, é recusado ao pedir o recorte dela, cria um projeto com e sem notas; a rodada dirigida não deixa achado alto ou médio; gates verdes; a etapa fechada no histórico.

---
