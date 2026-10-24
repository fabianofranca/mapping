# Mapping — Plano de desenvolvimento

> Este documento guarda o resumo do produto e **só as fases pendentes** (hoje em andamento a etapa **Proposto com componentes**, épico `epic/proposto-componentes`; a Marcações espaciais, notas e setas foi a última concluída). Ao concluir uma tarefa, marque o checkbox correspondente no mesmo PR.

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

## Etapa — Marcações espaciais, notas e setas (concluída)

Histórico completo (fases ME0 a ME5, decisões, regras de contenção, cascata noturna e o que ficou para depois) em [`docs/history/PLAN-etapa-marcacoes-espaciais.md`](docs/history/PLAN-etapa-marcacoes-espaciais.md).

## Etapa — Proposto com componentes (épico `epic/proposto-componentes`)

### Objetivo

Na revisão de propostas, a visão **Proposto** desenha os componentes que a proposta cria, com as marcas de revisão aprovadas pelo dono em 2026-10-24 (design system Mapping, seção "Revisão de propostas" › "Componentes novos na visão Proposto"; referência visual no canvas "Mapping — Proposto com componentes"). Nada de schema, formato de proposta nem MCP muda: é só desenho na app (o MCP fica 0.9.0, sem snapshot de versão nova e sem rótulo `mcp-rc`).

### Diagnóstico (2026-10-24)

- O derivado já desenha no Proposto as marcações novas de tipos que o catálogo conhece: `componentScenes` (`src/store/derived.ts`) lê o projeto à vista (`review.derived.shownProject`, o `previewProject` da proposta) e um teste descartável confirmou a cena da marcação criada. O canvas recebe `drawingsOf(drawnProject)` (`src/canvas/CanvasController.ts`).
- A limitação registrada na B4 (PR #174, "Visão Proposto não desenha os componentes novos") é o **catálogo**: `createComponentLibrary` (`src/store/componentLibrary.ts`, criado em `src/store/session.ts` por volta da linha 355) carrega os componentes das especializações do projeto **confirmado** (`store.committed`), lidos de `specs/<id>/`. Os tipos e versões que a proposta traz no pacote dela (`proposals/<id>/<dir>/`, mudança `specialization` de criar ou atualizar; ver `proposalPackageDir` e o trecho de `packages` em `src/model/proposalApply.ts`) não entram no catálogo, então as marcações desses tipos ficam sem desenho até aplicar.
- O cache por marcação (`createDrawingCache`, `src/model/componentDrawings.ts`) compara o `component` por identidade: um catálogo do Proposto que reaproveita os mesmos objetos de componente das especializações que a proposta não muda mantém as cenas das demais marcações.
- A regra do fantasma da criação rejeitada está em `src/canvas/reviewMarks.ts` (hoje só na visão Atual); o desenho da linha tracejada 6/4, da pontilhada e dos selos está em `src/canvas/renderers/review.ts`; a legenda usa a chave `review.legend.rejected` em `src/i18n/pt-BR.ts` e `src/i18n/en-US.ts`.

### Regras (aprovadas pelo dono em 2026-10-24)

- **Pendente, visão Proposto:** desenho inteiro, com os valores propostos, e a marca de criada por cima (linha tracejada 6/4 e selo "+" sobre `cv-badge`, como hoje).
- **Aceita, visão Proposto:** igual à pendente; a decisão aparece só no `DecisionMark` (Detalhes, Árvore, janela Propostas), não no canvas.
- **Rejeitada, visão Proposto:** sem desenho; só o fantasma pontilhado 1,5/2,5 com o nome e o selo ✕.
- **Inválida** (no conjunto que bloqueia Aplicar): desenho com a linha `cv-invalid` e o selo de inválida.
- **Visão Atual:** o componente criado não aparece (como hoje).
- **Componente existente alterado:** continua desenhado com os valores propostos e a linha dupla de alterada.
- **Campo obrigatório faltando num componente novo:** o desenho mostra o reservado/nó desconhecido como o canvas já faz, e a marcação leva a pendência de incompleta de sempre.

### Decisões do plano (do coordenador, a confirmar pelo dono)

1. **Catálogo do Proposto.** Na visão Proposto, com uma proposta aberta que cria ou atualiza especializações (mudança não rejeitada e não aplicada), o catálogo lido pelo derivado é o do projeto confirmado mais os componentes dos pacotes da proposta, lidos de `proposals/<id>/<dir>/` pelo mesmo carregador (`loadSpecComponents`), sem gravar nada. Na visão Atual e fora da revisão, o catálogo é o de hoje. Os componentes das especializações que a proposta não muda são os mesmos objetos (o cache por marcação vale). Enquanto o pacote proposto carrega, as marcações dele ficam sem desenho, como no carregamento do catálogo hoje. As fontes do pacote proposto entram pelo mesmo registro de fontes.
2. **Fantasma da criação rejeitada nas duas visões.** O fantasma pontilhado com nome e ✕ passa a aparecer na visão Proposto e continua na Atual (que já o mostra); a legenda `review.legend.rejected` deixa de dizer "(só em Atual)". A regra vale para toda marcação criada e rejeitada, com ou sem componente (`reviewMarks` não distingue).
3. **Tipo de especialização rejeitada.** Se a mudança da especialização for rejeitada e a da marcação não, a marcação aparece no Proposto sem desenho (o tipo não está no catálogo), com a pendência que o modelo já dá; não há regra nova.
4. A visão Proposto continua somente leitura e sem gesto: o desenho só reinstancia quando a proposta, a decisão ou a visão mudam, nunca a cada quadro.

### Fluxo, coordenador e esforço

- **Fluxo:** épico `epic/proposto-componentes` a partir da `main`; cada fase é um branch curto com PR com base no épico, na ordem PC1 → PC2; o PR do épico para a `main` fica aberto até o fim. Gates antes de cada PR: `npm run lint && npm run typecheck && npm test && npm run build`. Descrição do PR com Resumo, Como testar e Decisões tomadas; checkboxes marcados no mesmo PR. Sem mudança de MCP: nenhum rótulo `mcp-rc`.
- **Coordenador e esforço por fase** (regra da seção "Uso de modelos" do [`CLAUDE.md`](CLAUDE.md); a sessão confere o modelo antes de começar a fase). Os subagentes são sempre Sonnet (produção) e Haiku (mecânico):

| Fase | Coordenador | Esforço do coordenador | Subagentes                                                              |
| ---- | ----------- | ---------------------- | ----------------------------------------------------------------------- |
| PC1  | Opus        | high                   | Sonnet medium (high no briefing do catálogo do Proposto); mecânicos Haiku low |
| PC2  | Opus        | medium                 | Sonnet medium; mecânicos Haiku low                                      |

### Fases

#### PC1 — Catálogo do Proposto e desenho dos componentes novos (pendente, aceita, inválida, alterada)

**Coordenador:** Opus. **Esforço:** high; subagentes Sonnet medium (high no briefing do catálogo do Proposto); mecânicos Haiku low.

**Toca em (aproximado):** `src/store/componentLibrary.ts`, `src/store/session.ts`, `src/store/derived.ts` (o derivado recebe o catálogo da visão), `src/store/review.ts` se precisar, `src/canvas/CanvasController.ts` só se precisar, `src/storage/` (ler o pacote em `proposals/<id>/`, pasta e zip), `tests/store/`, `tests/canvas/`, `tests/canvas/renderPerformance.test.ts`, `tests/e2e/`, `docs/ARCHITECTURE.md` (uma linha sobre o catálogo do Proposto).

- [x] Proposta que cria marcações de um tipo já aplicado: o Proposto desenha cada uma com os valores propostos, a linha tracejada e o selo "+" (teste de canvas)
- [x] Proposta que traz um pacote novo ou atualizado: os componentes dos tipos novos ou da versão nova aparecem no Proposto e não na Atual; nada é gravado em `specs/` antes de aplicar (testes de store e de canvas)
- [x] Aceita igual à pendente no canvas (teste); inválida com a linha `cv-invalid` e o selo de inválida, com desenho (teste)
- [x] Componente existente alterado desenhado com os valores propostos e a linha dupla (teste que garante o que já funciona)
- [x] Campo obrigatório faltando num componente novo: reservado/nó desconhecido no desenho e a pendência de incompleta (teste)
- [x] Visão Atual não desenha o componente criado (teste)
- [x] Cache: trocar de visão ou decidir uma mudança não reinstancia as marcações que não mudaram (identidade da cena), e pan/zoom não reinstanciam nada (teste)
- [x] Orçamento de desempenho: uma proposta com dezenas de componentes novos (por exemplo, 60) dentro do orçamento de quadro, no padrão de `tests/canvas/renderPerformance.test.ts` (roda no `npm run test:perf`)
- [x] E2E: no padrão dos testes da revisão em `tests/e2e/` (o host do canvas publica `data-components`), abrir uma proposta com componentes novos e conferir a contagem no Proposto e na Atual
- [x] `npm run lint && npm run typecheck && npm test && npm run build` passam

#### PC2 — Fantasma da criação rejeitada no Proposto, legenda, roteiro e fechamento

**Coordenador:** Opus. **Esforço:** medium; subagentes Sonnet medium; mecânicos Haiku low.

**Toca em:** `src/canvas/reviewMarks.ts`, `src/i18n/pt-BR.ts`, `src/i18n/en-US.ts`, `tests/canvas/reviewMarks.test.ts`, `tests/canvas/renderers/review.test.ts`, `docs/PROPOSAL-FORMAT.md` ou `docs/ARCHITECTURE.md` se citarem a regra antiga, `docs/TESTING.md` (seção 8), `docs/history/`, `PLAN.md`, `docs/ROADMAP.md`, `CLAUDE.md`.

- [x] Criação rejeitada: no Proposto, sem desenho e com o fantasma pontilhado 1,5/2,5, o nome e o selo ✕; na Atual, o fantasma continua (testes unitários de `reviewMarks` por estado e visão: pendente, aceita, rejeitada, inválida, alterada, nas duas visões)
- [x] `review.legend.rejected` em pt-BR e en-US sem "(só em Atual)"
- [x] Roteiro novo no `docs/TESTING.md`, seção 8, executável pelo Cowork sozinho (extensão do navegador e shell; proposta preparada com um componente novo pendente, um aceito, um rejeitado, um inválido e um existente alterado), seguindo as convenções da seção 8
- [ ] Rodada dirigida do Cowork só com o desenvolvimento completo (PC1 mesclada e a PC2 pronta, no preview do PR da PC2), com o prompt de `docs/TESTING-COWORK.md` apontando para o roteiro novo (e os roteiros da revisão que a etapa toca); relato em `docs/history/relato-<data>-proposto-componentes.md` e achados corrigidos antes do fechamento
- [ ] Fechamento (depois da rodada do Cowork): histórico em `docs/history/PLAN-etapa-proposto-componentes.md` com as decisões consolidadas dos PRs; `PLAN.md` sem etapa em andamento; `docs/ROADMAP.md` (tira "a visão Proposto desenhar componentes novos" de "o que a Biblioteca deixou" e registra a etapa concluída) e `CLAUDE.md` (etapa atual) atualizados
- [ ] `npm run lint && npm run typecheck && npm test && npm run build` passam

### Fora do escopo

Mudança de schema, de formato de proposta ou do MCP; desenhar componentes na visão Atual; regras novas para imagens criadas ou removidas.
