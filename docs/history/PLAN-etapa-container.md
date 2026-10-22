# Histórico — Etapa Container (seção do antigo PLAN.md)

> Fases CN1 e CN2 concluídas no épico `epic/container` (CN1 no PR #206; CN2 no PR da fase, com o fechamento). Origem: pedido do dono em 2026-10-21 (item "Container no lugar de tela" do `docs/ROADMAP.md`). Schema v12, especialização `formatVersion` 6, proposta `formatVersion` 2 e MCP 0.8.0.
>
> Arquivo histórico: seção movida do `PLAN.md` sem alterações de conteúdo, exceto os checkboxes (marcados ao fechar a etapa). Depois dela vêm as decisões consolidadas dos PRs.

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

- [x] Diálogo renomeado para Container, com Personalizado, Tamanho da seleção e os presets das especializações aplicadas agrupados pelo nome delas, com teste
- [x] `containers` na especialização `formatVersion` 6, com validação e `docs/spec.schema.json`; Material 3 regenerada (`npm run build:examples`); teste do validador (`id` repetido, tamanho fora do limite)
- [x] `add_container` nas propostas e no lote do MCP, `add_blank_image` aceito com aviso, formato da proposta 2 (a 1 continua lida), com testes
- [x] Textos da interface e do MCP sem "tela" (i18n nos dois idiomas, `CONTAINER_LABEL`, mensagem de `mcp/imageTools.ts`)
- [x] Prosa dos documentos e da skill `spec-author` com "container" e "componente com slot"; `isContainer` → `hasSlot`, `isContainerComponent` → `hasSlotComponent`
- [x] Roteiros do `docs/TESTING.md` atualizados: criar um container por preset da especialização, por Personalizado e por Tamanho da seleção; o agente cria um por `add_container`
- [x] `grep -rn -i "tela em branco\|blank" src mcp docs/*.md scripts tests` só encontra `docs/history/`, a aceitação de `add_blank_image` e o que for nome de arquivo de imagem

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

- [x] Schema v12 com migração v11 → v12 e backup; testes de migração (v11 com imagem e com tela em branco → v12) e de abertura de v12
- [x] Tools e operações renomeadas, com as antigas aceitas com aviso; testes por stdio
- [x] MCP 0.8.0 (`mcp/version.ts`); o rótulo `mcp-rc` **não** foi posto na CN2 (cascata noturna: o rótulo vai no PR da ME5; decisão do dono)
- [x] Zip do exemplo e guia regenerados e conferidos pelos testes (`npm run build:example`, `npm run build:guia`)
- [x] Documentação e skill `spec-author` com o vocabulário e o formato novos
- [x] Identificadores internos renomeados para container, com os testes existentes verdes
- [x] Roteiros do `docs/TESTING.md`: abrir um projeto v11 e ver a faixa da migração; o agente lê e cria containers pelas tools novas
- [x] Fechamento: histórico em `docs/history/PLAN-etapa-container.md` (com as decisões consolidadas dos PRs), `PLAN.md` sem etapa em andamento, `docs/ROADMAP.md` e `CLAUDE.md` atualizados

**Aceite:** um projeto v11 abre, migra para v12 com backup e mostra os mesmos containers; o agente usa `get_container`, `add_container` com arquivo e com fundo, e uma proposta antiga com `add_image` ou `add_blank_image` ainda aplica, com aviso; `grep -rn "images\b" src mcp` só encontra a pasta `images/` e a migração; gates verdes; rodada dirigida do Cowork sem achado alto ou médio, se o dono pedir.

---

## Decisões consolidadas dos PRs

- **CN1 (PR #206):** diálogo Novo container (Personalizado, Tamanho da seleção e presets das especializações agrupados pelo nome delas); `containers` na especialização `formatVersion` 6; `PROPOSAL_FORMAT_VERSION` 2 com `add_container` e `add_blank_image` aceito com aviso `deprecated-op`; `isContainer` → `hasSlot` e `isContainerComponent` → `hasSlotComponent`. Sem especialização o diálogo abre em Personalizado 360×800 branco.
- **CN2:**
  - **Schema v12:** `images` → `containers` e, na marcação, `imageId` → `containerId` (o plano só citava a coleção; o plano da etapa seguinte já assume `containerId`). Migração `migrateFrom11To12` só renomeia chaves, com o backup genérico de migração; invariante `blank-background` → `container-content`.
  - **Proposta:** `PROPOSAL_FORMAT_VERSION` continua 2. O cabeçalho da mudança (`Change.imageId`, `entity: 'image'`, níveis de revisão `image`) não mudou; os campos da *marcação* dentro da proposta passam a `containerId`, e `parseProposal` lê propostas antigas convertendo `imageId` → `containerId` nesses pontos.
  - **MCP 0.8.0:** `get_container`/`get_container_file` (as antigas respondem com `deprecated-tool`); `add_container` aceita arquivo (`file`/`base64`/`fileName`) ou `width`/`height`/`background`, e a combinação ambígua é recusada; `update_container`, `replace_container`, `delete_container`; `add_image`, `add_blank_image`, `update_image`, `replace_image`, `delete_image` e o argumento `image` aceitos com aviso (`deprecated-op`, `deprecated-argument`). Nas saídas, `image(s)` → `container(s)` e o campo `blank: true` saiu (container sem arquivo mostra `file: null` e `background`). Referências `mapping://…/i/…` não mudam.
  - **Identificadores:** `ProjectContainer`, `Project.containers`, `src/model/containers.ts`, funções `*Container*`, `addBackgroundContainer`/`isBackgroundContainer`/`MAX_CONTAINER_SIZE`; códigos de erro `blank-image` → `container-without-file` e `not-blank` → `container-has-file`. Códigos de invariante `missing-image`, `rect-out-of-image`, `images-overlap` e `parent-other-image` ficaram.
  - **Rótulo `mcp-rc` e rodada do Cowork:** não postos na CN2 (cascata noturna); ficam para decisão do dono.
  - Roteiros novos: R3.8c (abrir um v11), R9.19 e R9.20 (tools novas e depreciações).
