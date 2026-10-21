# Mapping — Plano de desenvolvimento

> Este documento guarda o resumo do produto e **só as fases pendentes** (hoje a etapa Container, abaixo; a Canvas limpo foi a última concluída). Ao concluir uma tarefa, marque o checkbox correspondente no mesmo PR.

## Produto

Aplicação web para mapear áreas de imagens com **marcações retangulares**, organizar informações em **camadas** e registrar **anotações** (pares chave-valor livres ou anotações **tipadas** definidas por uma **especialização**). Tudo é salvo num `mapping.json` ao lado das imagens (pasta ou zip), num formato pensado para ser lido por um agente de IA, que deve conseguir recortar, na imagem original, a área exata de cada marcação.

Estado: **etapas 1 a 2.5, 3a (servidor MCP, base), 3b (referências de código), 4 (propostas de alteração com revisão), 5 (pré-voo para uso real), 6 (correções da primeira rodada de testes), 7 (correções da rodada dirigida), 8 (consolidação por subsistema), 9 (ajustes do teste manual avançado; schema v9 e servidor MCP 0.4.0) e 10 (correções da rodada dirigida da etapa 9) concluídas**, além do laboratório de componentes e da etapa **Biblioteca** (schema v10; servidor MCP 0.5.0). O dono fez uso real grande e considerou o marco "Uso real" **alcançado em 2026-10-16**: a ferramenta já serve e a prioridade passou à biblioteca de componentes, hoje entregue. O **laboratório de componentes** está concluído (épico `epic/lab` mesclado em 2026-10-17; descrição em [`lab/README.md`](lab/README.md), histórico em [`docs/history/PLAN-etapa-lab.md`](docs/history/PLAN-etapa-lab.md)). A etapa **Biblioteca** (épico `epic/biblioteca`, fases B1 a B5 e Fechamento) está concluída, testada pelo Cowork e mesclada na `main` (PR #180, tag `mcp-v0.5.0`; histórico em [`docs/history/PLAN-etapa-biblioteca.md`](docs/history/PLAN-etapa-biblioteca.md)). A etapa **Código de instanciação** (épico `epic/instanciacao`, fases C1 a C4; especialização `formatVersion` 5, schema v11, MCP 0.6.0) está concluída e testada pelo Cowork e pelo dono no Claude Code; épico mesclado na `main`, com a tag estável `mcp-v0.6.0` (histórico em [`docs/history/PLAN-etapa-instanciacao.md`](docs/history/PLAN-etapa-instanciacao.md)). A etapa **Canvas limpo** (épico `epic/canvas-limpo`, fases V1 e V2; sem schema, formato nem MCP novos) está concluída: o cartão de texto do zoom semântico saiu do canvas e o **Ver limpo** (`Alt+H`) mostra só as imagens e os componentes (histórico em [`docs/history/PLAN-etapa-canvas-limpo.md`](docs/history/PLAN-etapa-canvas-limpo.md)). A etapa **Container** (épico `epic/container`, fases CN1 e CN2; schema v12, especialização `formatVersion` 6, proposta `formatVersion` 2 e MCP 0.8.0 ao fim) está em andamento: o objeto de topo do canvas passa a se chamar container e os presets de dispositivo saem do núcleo para a especialização. O `index.html` é um único arquivo autocontido (funciona em `file://` e no GitHub Pages), **só desktop** (largura mínima de 900 px), com tema claro/escuro e pt-BR/en-US.

## Documentação

| Documento                                                | Conteúdo                                                                       |
| -------------------------------------------------------- | ------------------------------------------------------------------------------ |
| [`README.md`](README.md)                                 | O que é, como rodar, testar, publicar e usar o preview                         |
| [`CLAUDE.md`](CLAUDE.md)                                 | Regras de trabalho e de arquitetura para o Claude Code                         |
| [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md)           | Camadas, fluxo de dados, regras (com o porquê) e onde fica cada coisa          |
| [`docs/GUIDE.md`](docs/GUIDE.md)                         | Guia interativo (`guia/`) e projeto de exemplo: geração, o que gravam, como mudar |
| [`docs/FORMAT.md`](docs/FORMAT.md)                       | Referência do `mapping.json` (schema v11)                                      |
| [`docs/PROPOSAL-FORMAT.md`](docs/PROPOSAL-FORMAT.md)     | Formato da proposta de alteração e regras da revisão (etapa 4)                 |
| [`docs/SPEC-FORMAT.md`](docs/SPEC-FORMAT.md)             | Formato do arquivo de especialização, `formatVersion` 1 a 5 (e `docs/spec.schema.json`): biblioteca, contrato de versão e validação |
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
| [`docs/ROADMAP.md`](docs/ROADMAP.md) | Ordem das próximas etapas (etapa Container em andamento), marco de uso real e evoluções |
| [`docs/redesign/HANDOFF.md`](docs/redesign/HANDOFF.md) | Redesign da interface (etapa 2.3, concluída; referência): componentes, tokens, mudanças B#, propostas P# e decisões |
| [`docs/redesign/HANDOFF-PROPOSALS.md`](docs/redesign/HANDOFF-PROPOSALS.md) | Design das propostas de alteração (fase 4.0): telas, componentes e tokens novos, comportamento, atalhos e pontos em aberto |
| [`docs/redesign/BRIEF-REVIEW-DETAILS.md`](docs/redesign/BRIEF-REVIEW-DETAILS.md) | Briefing para o Claude Design dos Detalhes na revisão (fase 9.1, concluída; referência): problema, estado atual, requisitos, restrições e os estados E1 a E17 |
| [`docs/redesign/HANDOFF-REVIEW-DETAILS.md`](docs/redesign/HANDOFF-REVIEW-DETAILS.md) | Design dos Detalhes na revisão (etapa 9, aprovado; referência): marcador e popover por campo, cabeçalho do item, “Outras mudanças”, comportamento, textos e decisões |

---

## Etapa — Container (épico `epic/container`)

### Objetivo

A ferramenta não é só para telas de app. O objeto de topo do canvas (id, nome, tamanho, `placement` e um conteúdo, que é um arquivo de imagem ou uma cor de fundo) passa a se chamar **container** em tudo o que a pessoa e o agente leem: interface, MCP, propostas, formato e documentação. O nome "tela" e os presets de dispositivo saem do núcleo; os presets passam a vir da especialização. Origem: pedido do dono em 2026-10-21 (item "Container no lugar de tela" do [`docs/ROADMAP.md`](docs/ROADMAP.md)), com a regra do núcleo genérico do [`CLAUDE.md`](CLAUDE.md).

### Decisões

Todas confirmadas pelo dono em 2026-10-21.

- **Termo: `container`** nos identificadores e "Container" na interface (pt-BR e en-US). O único conflito era de prosa: o `docs/COMPONENT-FORMAT.md` e comentários de `src/model/components/` chamam de "container" o componente com slot; passam a "componente com slot", e as funções `isContainer` de `src/model/components/arrange.ts` e `isContainerComponent` de `src/model/componentCatalog.ts` passam a `hasSlot` e `hasSlotComponent`. "Tela" continua só como caso de uso ("tela de app mapeada") e na chave `screen` de `origins`, que descreve o documento do sistema externo e está no formato v4: não muda.
- **A fase 2 entra no mesmo épico.** O vocabulário é lido pelo agente em toda chamada; interface dizendo "container" e JSON dizendo `images` custaria confusão para sempre, e a migração custa uma vez.
- **A letra `i` das referências `mapping://<projeto>/i/<código>` fica**, por compatibilidade com referências já coladas em conversas e documentos. `ItemKind` (`src/model/itemRef.ts`) não muda; a documentação diz que `i` é o container.
- **Presets vêm da especialização.** Chave `containers` na raiz, lista de `{ id, name, width, height, background? }`: `id` `[a-z0-9-]+` único na especialização, `name` não vazio, `width` e `height` inteiros de 1 a `MAX_BLANK_SIZE` (20000), `background` cor `#RRGGBB` (padrão branco). Entra na **`formatVersion` 6** da especialização (a 5 continua aceita; a mudança é aditiva). O núcleo fica só com dois presets que não são de domínio: **Personalizado** e **Tamanho da seleção** (o retângulo da marcação selecionada; desabilitado sem seleção). O diálogo agrupa os presets por especialização aplicada. A biblioteca Material 3 (`scripts/libraryExamples.ts`, que gera `examples/libraries/material3/`) passa a trazer Celular 360×800, Celular grande 412×915, Tablet 800×1280 e Desktop 1440×900, que hoje estão em `src/ui/blankScreen.ts`.
- **Operações e tools.** A CN1 cria `add_container { name, width, height, background }` nas propostas e no lote do MCP e aceita `add_blank_image` com aviso ("use add_container") no `PROPOSAL_FORMAT_VERSION` **2** (a 1 continua lida). A CN2 amplia `add_container` para aceitar `file` (largura e altura vêm do arquivo) e passa `add_image` a aceito com aviso; `update_image`, `replace_image` e `delete_image` viram `update_container`, `replace_container` e `delete_container` (as antigas aceitas com aviso por uma versão); as tools `get_image` e `get_image_file` viram `get_container` e `get_container_file`. `get_marking_image` **fica** (devolve um recorte de imagem), e a pasta `images/` **fica** (guarda arquivos de imagem).
- **Schema v12 (CN2).** `images` vira `containers` no `mapping.json`; cada container tem `file` (string ou `null`) e `background` (cor ou `null`), com a invariante atual (`file === null` se, e somente se, `background !== null`) renomeada de `blank-background` para `container-content`. Migração v11 → v12 com backup, só renomeando a chave; nada apagado. O `docs/FORMAT.md` ganha "Campos da v12 (container)".
- **Identificadores internos.** O tipo da imagem em `src/model/types.ts`, `Project.images`, `projectIndex`, stores, canvas e interface são renomeados para container no fim da CN2, de forma mecânica (Haiku), depois de o JSON novo passar nos testes. São 83 arquivos em `src/` e `mcp/`, então a renomeação pode ser um PR próprio dentro do épico. Ela não muda comportamento e não gera teste novo além dos existentes verdes.
- **MCP 0.8.0** (`mcp/version.ts`, uma versão por épico). O PR da CN2 leva o rótulo `mcp-rc`; a estável `mcp-v0.8.0` é tag do dono depois do merge do épico na `main`.
- **Rodada do Cowork.** Dirigida, no fim da CN2, nos roteiros que a etapa toca (os que criam tela em branco e os do MCP), com o build do preview do épico; o dono decide no PR se roda.
- **Coordenador e esforço por fase** (regra da seção "Uso de modelos" do [`CLAUDE.md`](CLAUDE.md); a sessão confere o modelo antes de começar): CN1 **Sonnet**, medium (subagentes Sonnet medium; mecânicos Haiku low); CN2 **Sonnet**, medium (subagentes medium, **high** no briefing da migração v11 → v12 e do lote do MCP; mecânicos Haiku low). A especificação está fechada neste plano: não há decisão de formato nova além das registradas.
- **Fluxo:** épico `epic/container` a partir da `main`; um branch e um PR por fase (ou por parte) com base no épico; gates antes do PR (`npm run lint && npm run typecheck && npm test && npm run build`, mais `npm run build:mcp`, `npm run build:examples` e `npm run build:example` onde tocar); descrição do PR com Resumo, Como testar e Decisões tomadas; checkboxes marcados no mesmo PR; a CN2 faz o fechamento (histórico em `docs/history/PLAN-etapa-container.md`, `PLAN.md`, `docs/ROADMAP.md`, `CLAUDE.md`).

### Fases

A CN1 vem primeiro porque fixa o vocabulário que a CN2 leva ao formato.

#### CN1 — Superfície, operação e presets

**Coordenador:** Sonnet. **Esforço:** medium; subagentes Sonnet medium; mecânicos Haiku low.

**Toca em:**

- Interface: `src/ui/BlankScreenDialog.tsx` → `ContainerDialog.tsx`; `src/ui/blankScreen.ts` sem os presets de dispositivo (`phone`, `phoneLarge`, `tablet`, `desktop` em `BLANK_PRESETS`), com `CUSTOM_PRESET` e o preset "Tamanho da seleção"; chaves i18n `blank.*` → `container.*` e `image.blankUntitled` → "Container", nos dois idiomas; quem abre o diálogo em `src/app/EditorDialogs.tsx`, `useEditorDialogs.ts`, `EditorMainBar.tsx` e `EditorTools.tsx`; `src/ui/labels.ts`, `SelectionPanel.tsx` e `review/changeText.ts`.
- Especialização: `src/model/spec.ts` com `containers` e `formatVersion` 6, `docs/spec.schema.json`, validador da biblioteca com os erros de `id` repetido e tamanho fora do limite, `get_specialization` expondo `containers`; `scripts/libraryExamples.ts` com os quatro presets e `npm run build:examples`; skill `spec-author` e `docs/SPEC-FORMAT.md`.
- Propostas e MCP: `src/model/proposal.ts` (`PROPOSAL_FORMAT_VERSION` 2, com `add_container` e `add_blank_image` aceito com aviso); `mcp/operations.ts`, `mcp/batch.ts` e `mcp/items.ts` (`BLANK_IMAGE_LABEL` → `CONTAINER_LABEL`, "Container"); `mcp/imageTools.ts` (mensagem "tela em branco").
- Prosa: `docs/COMPONENT-FORMAT.md` ("componente com slot"; `isContainer` → `hasSlot`, `isContainerComponent` → `hasSlotComponent`), `docs/FORMAT.md`, `docs/MCP.md`, `docs/AGENT-GUIDE.md`, `docs/PROPOSAL-FORMAT.md`, `docs/ARCHITECTURE.md`, `docs/TESTING.md` e `scripts/guia/` sem "tela em branco", com "container".
- Testes: `tests/model/proposalBlank.test.ts`, `tests/mcp/blankComponents.test.ts`, `tests/mcp/imageFixtures.ts`, `tests/e2e/blankScreen.spec.ts`, testes de i18n e do validador.

- [ ] Diálogo renomeado para Container, com Personalizado, Tamanho da seleção e os presets das especializações aplicadas agrupados pelo nome delas, com teste
- [ ] `containers` na especialização `formatVersion` 6, com validação e `docs/spec.schema.json`; Material 3 regenerada (`npm run build:examples`); teste do validador (`id` repetido, tamanho fora do limite)
- [ ] `add_container` nas propostas e no lote do MCP, `add_blank_image` aceito com aviso, formato da proposta 2 (a 1 continua lida), com testes
- [ ] Textos da interface e do MCP sem "tela" (i18n nos dois idiomas, `CONTAINER_LABEL`, mensagem de `mcp/imageTools.ts`)
- [ ] Prosa dos documentos e da skill `spec-author` com "container" e "componente com slot"; `isContainer` → `hasSlot`, `isContainerComponent` → `hasSlotComponent`
- [ ] Roteiros do `docs/TESTING.md` atualizados: criar um container por preset da especialização, por Personalizado e por Tamanho da seleção; o agente cria um por `add_container`
- [ ] `grep -rn -i "tela em branco\|blank" src mcp docs/*.md scripts tests` só encontra `docs/history/`, a aceitação de `add_blank_image` e o que for nome de arquivo de imagem

**Aceite:** num projeto com a Material 3 aplicada, o diálogo Novo container lista os quatro presets dela sob o nome da biblioteca, mais Personalizado e Tamanho da seleção; sem especialização só os dois; o agente cria um container por `add_container` e uma proposta antiga com `add_blank_image` ainda aplica, com aviso; gates verdes.

#### CN2 — O conceito no formato e fechamento

**Coordenador:** Sonnet. **Esforço:** medium; subagentes medium, **high** no briefing da migração v11 → v12 e do lote do MCP; mecânicos Haiku low.

**Toca em:**

- Modelo: `src/model/types.ts` (`SCHEMA_VERSION` 12), `src/model/schema.ts` (com `containers`), `src/model/migrations.ts` (v11 → v12 com backup), `src/model/invariants.ts` (`container-content`), `src/model/itemRef.ts` (só a documentação do `i`).
- MCP: `mcp/tools.ts` (`get_container` e `get_container_file`), `mcp/operations.ts` e `mcp/batch.ts` (`add_container` aceitando `file`, `update_container`, `replace_container`, `delete_container`, as antigas aceitas com aviso), `mcp/version.ts` (0.8.0), `mcp/items.ts` e `mcp/markingList.ts`.
- Exemplos e guia: `scripts/exampleProject.mjs` e `npm run build:example` (o zip em v12); `scripts/guia/` e `npm run build:guia`; `examples/workspace/`; skill `spec-author`.
- Documentação: `docs/FORMAT.md` ("Campos da v12 (container)"), `docs/MCP.md`, `docs/AGENT-GUIDE.md`, `docs/PROPOSAL-FORMAT.md`, `docs/ARCHITECTURE.md` e `docs/TESTING.md`.
- Identificadores internos: renomeação mecânica, por Haiku, de imagem para container em `src/` e `mcp/` (83 arquivos), possivelmente num PR próprio.
- Fechamento: `docs/history/PLAN-etapa-container.md`, `PLAN.md`, `docs/ROADMAP.md` e `CLAUDE.md`.

- [ ] Schema v12 com migração v11 → v12 e backup; testes de migração (v11 com imagem e com tela em branco → v12) e de abertura de v12
- [ ] Tools e operações renomeadas, com as antigas aceitas com aviso; testes por stdio
- [ ] MCP 0.8.0 (`mcp/version.ts`) e rótulo `mcp-rc` no PR
- [ ] Zip do exemplo e guia regenerados e conferidos pelos testes (`npm run build:example`, `npm run build:guia`)
- [ ] Documentação e skill `spec-author` com o vocabulário e o formato novos
- [ ] Identificadores internos renomeados para container, com os testes existentes verdes
- [ ] Roteiros do `docs/TESTING.md`: abrir um projeto v11 e ver a faixa da migração; o agente lê e cria containers pelas tools novas
- [ ] Fechamento: histórico em `docs/history/PLAN-etapa-container.md` (com as decisões consolidadas dos PRs), `PLAN.md` sem etapa em andamento, `docs/ROADMAP.md` e `CLAUDE.md` atualizados

**Aceite:** um projeto v11 abre, migra para v12 com backup e mostra os mesmos containers; o agente usa `get_container`, `add_container` com arquivo e com fundo, e uma proposta antiga com `add_image` ou `add_blank_image` ainda aplica, com aviso; `grep -rn "images\b" src mcp` só encontra a pasta `images/` e a migração; gates verdes; rodada dirigida do Cowork sem achado alto ou médio, se o dono pedir.

---
