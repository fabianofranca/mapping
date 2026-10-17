# CLAUDE.md

## Projeto

Mapping: app web para marcar áreas retangulares em imagens, organizar em camadas e anotar com pares chave-valor, salvando tudo num `mapping.json` ao lado das imagens.

**Leia o `PLAN.md` antes de qualquer tarefa** (resumo do produto e fases pendentes, quando houver). Trabalhe **uma fase por vez**, na ordem, e marque os checkboxes concluídos no próprio PR. A referência atual está em `docs/` (`ARCHITECTURE.md`, `FORMAT.md`, `SPEC-FORMAT.md`, `MCP.md`, `AGENT-GUIDE.md`); o plano das etapas concluídas está em `docs/history/`. Os roteiros de teste manual e o template do relato estão em `docs/TESTING.md`.

Skills do Claude Code ficam em `.claude/skills/`: **`spec-author`** escreve e valida especializações (`docs/SPEC-FORMAT.md`); o prompt que a invoca só especifica a origem, o `id`, a `formatVersion` e as plataformas (modelo no fim da própria skill). Para usá-la no repositório do código que está sendo mapeado, copie a pasta para o `.claude/skills/` dele ou para `~/.claude/skills/`. `examples/workspace/` é o esqueleto de uma pasta central de mapeamentos (servidor, raízes, skill e `AGENTS.md` para qualquer cliente MCP). `lab/` guarda experimentos fora do produto (páginas à parte em `dist/lab/`, sem i18n nem store; regras e o que cada um valida em `lab/README.md`).

## Stack

- Vite + TypeScript (strict) + Preact + @preact/signals
- Konva.js (canvas), JSZip (zip), zod (validação do schema), idb (IndexedDB)
- vite-plugin-singlefile: o build gera **um único `dist/index.html`** autocontido
- Vitest para testes
- Deploy: GitHub Pages via GitHub Actions

## Comandos

```bash
npm run dev       # servidor de desenvolvimento
npm run build     # gera dist/index.html
npm test          # vitest (modelo, store, storage, canvas e componentes)
npm run test:coverage # vitest com relatório de cobertura (coverage/); pula os orçamentos de desempenho
npm run test:perf # só os orçamentos de desempenho (sem cobertura; o CI roda separado)
npm run test:e2e  # Playwright contra dist/index.html; roda no CI (localmente: npm run build e PLAYWRIGHT_CHROMIUM_EXECUTABLE=<chrome>)
npm run build:mcp # gera dist-mcp/mapping-mcp.js (servidor MCP, etapa 3a)
npm run dev:lab:react # página de demonstração do visualizador embutível (lab/viewer, fase L1)
npm run build:viewer # gera dist-viewer/ (mapping-viewer.js, mapping-viewer-react.js e types/)
npm run lint      # eslint + prettier --check
npm run typecheck # tsc --noEmit (app e mcp/)
```

Antes de finalizar qualquer tarefa: `npm run lint && npm run typecheck && npm test && npm run build` precisam passar.

## Regras de arquitetura

- `src/model/` contém só funções puras e imutáveis, sem DOM. Toda regra de negócio fica aqui e é testada.
- **`src/model/` não pode depender de APIs de navegador** (DOM, `window`, `document`, IndexedDB, File System Access, `createImageBitmap`, `Image`, canvas, `localStorage`). Ele será reutilizado por um servidor MCP em Node na etapa 3. Use apenas APIs disponíveis tanto no navegador quanto no Node (ex: `crypto.randomUUID()`). Tudo que depende de navegador (leitura de dimensões da imagem, EXIF, bitmaps) fica em `src/storage/` ou `src/canvas/` e entrega dados já prontos ao `model/`. A regra é imposta automaticamente: ESLint (`no-restricted-globals`/`no-restricted-imports` em `src/model/**`) e o projeto `model` do Vitest, que roda `tests/model/` com `environment: 'node'`.
- Toda mutação do projeto passa por uma action do store. Nunca altere o estado diretamente num componente.
- O estado do projeto (JSON + undo) é separado do estado da UI (seleção, visibilidade, modo, viewport).
- Consultas por id e agrupamentos do projeto usam `projectIndex(p)` (`src/model/projectIndex.ts`, memoizado por versão do projeto), nunca `find`/`filter` dentro de laços. O estado derivado do editor (camadas visíveis, indicadores, visibilidade, pendências, lista) fica em `src/store/derived.ts` e é lido por canvas, painel e lista, sem recalcular.
- O `mapping.json` só é gravado pela sessão (`src/store/session.ts`): ela confere o arquivo (`revision` e conteúdo) antes de gravar e grava `revision + 1`; nenhum outro código escreve no armazenamento do projeto. Alterações externas (MCP, editor de texto) viram recarga ou o diálogo "Projeto alterado fora da app" (`docs/ARCHITECTURE.md`).
- O canvas desenha no máximo uma vez por quadro (`requestAnimationFrame`); pan e zoom não recalculam dados que dependem só do projeto.
- Um gesto (arrastar/redimensionar) gera **uma** entrada no histórico de undo.
- Konva fica isolado em `src/canvas/` (`CanvasController` imperativo). Componentes Preact não importam Konva, exceto `CanvasHost`. Não usar `react-konva`.
- As coordenadas das marcações são **sempre** em pixels da imagem original. Conversões de tela/canvas ficam só em `src/canvas/`.
- Nenhuma string de UI hardcoded: tudo via `t()` com chaves em `src/i18n/pt-BR.ts` e `src/i18n/en-US.ts`.
- Nenhum valor de design fixo (cor, espaço, raio, fonte, opacidade, duração, z-index) fora dos tokens: use `var(--…)` dos tokens de `src/theme/tokens.ts` (fonte única, temas claro e escuro). Borda de controle usa `--color-border-control`; `--color-border` é só divisória. O canvas lê os tokens do tema. Um teste (`tests/theme/tokenLiterals.test.ts`) procura literais no CSS.
- Controles de formulário e botões vêm de `src/ui/controls/` (`Button`, `IconButton`, `TextField`, `Select`, `Choice`, `Segmented`, `Tabs`, `Tooltip`) e ícones de `<Icon name="…" />` (`src/ui/icons.tsx`); não crie botão, campo ou ícone avulso. Altura, raio e ícone vêm dos papéis `--control-*` (28px/16px).

## Restrições do ambiente de execução

- O `index.html` precisa funcionar em **`file://` no Chrome/Edge desktop** e hospedado no **GitHub Pages**:
  - nada de import de módulos externos em runtime nem requisições de rede;
  - o service worker só é registrado quando `location.protocol === 'https:'`;
  - detecte os recursos em runtime (`showDirectoryPicker`, IndexedDB, `navigator.canShare`) e degrade com elegância;
  - o `dist/index.html` leva uma **CSP** em `<meta>` gerada no build (`pwa/csp.ts`; hashes dos blocos embutidos, sem `'unsafe-inline'`/`'unsafe-eval'`, `connect-src 'none'`). Por isso: sem `style=""` nem handlers inline no HTML, sem `eval`/`new Function`, sem `setAttribute('style')`, sem `fetch`/XHR/WebSocket (estilo dinâmico só por JS: `el.style.x`, objeto `style` do Preact). Não escreva a CSP à mão no `index.html`. Detalhes em `docs/ARCHITECTURE.md`.
- **Só desktop**: largura mínima de 900 px (token `size-app-min`), mouse e teclado; toque simples funciona (clicar, arrastar, rolar e a pinça), gestos de celular não. Abaixo de 900 px a app mostra o aviso "Abra numa janela maior" no lugar da tela, sem desmontar nada (o projeto continua aberto e gravando). Não há layout de celular (decisão da fase 5.8).
- Envolva todo acesso a `localStorage`/IndexedDB em try/catch.

## Código

- Identificadores e nomes de arquivos em inglês. Comentários e documentação podem ser em português.
- TypeScript strict, sem `any` (use `unknown` + validação).
- Componentes pequenos e funcionais; lógica fora dos componentes.
- Não adicione dependências além da stack acima sem justificar no PR.

## Fluxo de trabalho

- O dono do projeto usa o Claude Code **pelo celular** e não roda nada localmente.
- **Tudo chega à `main` por um épico.** Cada etapa (ou frente que só deve chegar à `main` depois de validada inteira, como o laboratório `lab/`) é um branch `epic/<nome>` com um PR para a `main`, aberto até o fim. Cada fase, ou parte de fase, é um branch curto e um PR **com base no branch do épico**, com a descrição de sempre; mesclado, ele some e o épico avança. A descrição do PR do épico não é reescrita a cada parte: ela é fechada uma vez, quando o dono decidir mesclar. A `main` entra no épico por merge (nunca rebase nem force-push) quando houver conflito ou algo de que o épico precise. Uma etapa pequena ainda é um épico, com uma só parte. Os épicos abertos são os PRs de `epic/*` para a `main`.
- **A `main` só aceita PR de `epic/*`:** o job `epic` do `ci.yml` falha para qualquer outra origem (menos `dependabot/*`) e é check obrigatório no ruleset "main protegida". O CI roda igual em PRs para o épico e em push no branch dele; o preview publica qualquer branch pelo `workflow_dispatch`.
- Toda descrição de PR contém:
  1. **Resumo** do que mudou;
  2. **Como testar**: passos manuais objetivos no desktop, lembrando que o deploy do branch pode ser disparado pelo `workflow_dispatch`;
  3. **Decisões tomadas** que não estavam no `PLAN.md`.
- Se algo no `PLAN.md` estiver ambíguo ou for inviável, registre a dúvida no PR em vez de inventar comportamento grande. Para detalhes pequenos, decida, siga e documente.

## Uso de modelos (economia de cota sem perder qualidade)

O dono quer gastar pouco da cota do modelo mais caro. O que segura a qualidade é a especificação fechada e os testes, não o modelo que digita.

- **Sessão nova por assunto.** Cada turno relê a sessão inteira; quando um tema fecha (PR aberto e descrito), o próximo começa em outra sessão. O PR, o `PLAN.md` e os `README` são o contexto de entrada.
- **O modelo principal (Fable/Opus) faz só o que exige julgamento:** entender o pedido, decidir formato e arquitetura, escrever o briefing dos subagentes, revisar o que volta, integrar e conversar com o dono.
- **Subagentes Sonnet produzem o resto, sempre com um briefing que diga o objetivo, os arquivos a ler, o que fica fora, e os comandos de validação (`npx vitest run <arquivos>`, `npx eslint`, `npx prettier --check`, `npx tsc --noEmit`) que precisam passar antes de devolver:** código a partir de especificação, componentes e exemplos, testes unitários e ponta a ponta, correção de teste frágil, documentação e descrição de PR, scripts de captura e medição, triagem de log do CI, refatorações mecânicas.
- **Haiku para o mecânico:** renomear, formatar, varrer logs, atualizar contagens em testes.
- **Vale também para mudanças pequenas e para texto de PR.** Uma linha de documentação, um job de CI ou a descrição de um PR são produzidos por subagente a partir do briefing; o modelo principal decide o conteúdo e revisa. Tamanho não é exceção.
- **Menos idas e vindas do modelo principal:** validar em lote (`npm run lint && npm run typecheck && npm test && npm run build` uma vez, no fim), uma captura de tela por entrega, respostas curtas que se sustentam sozinhas.
- **Nunca delegar sem contexto:** o subagente só sabe o que está no briefing; apontar os arquivos e as regras deste `CLAUDE.md` que valem para a tarefa.
- **Coordenador e esforço definidos por fase.** Cada fase tem um modelo coordenador (Fable, Opus, Sonnet ou Haiku, do mais caro ao mais barato): o da sessão principal, que lê o pedido, escreve os briefings dos subagentes, revisa e integra. Antes de começar uma fase, a sessão confere o modelo em que roda (`session_context.model` da ferramenta `get_session` do servidor `claude-code-remote`, quando existir; senão a identidade informada no prompt do sistema). Se o modelo da sessão for superior ao definido, ela não executa a fase: diz qual é o modelo definido e pede ao dono para trocar de modelo ou abrir a sessão no modelo certo. Se for inferior, avisa que está abaixo do definido e só continua se o dono confirmar. Fase sem modelo definido segue o padrão desta seção (Fable/Opus coordena). Os subagentes não mudam, seja qual for o coordenador (Sonnet produz, Haiku faz o mecânico). Cada fase define também o nível de esforço (`low`, `medium`, `high`, `xhigh`, `max`) do coordenador e dos subagentes. O esforço do coordenador é definido pelo dono ao abrir a sessão; a sessão não tem como conferir o próprio esforço com segurança, então não há recusa por esforço, só por modelo. O esforço dos subagentes é passado explicitamente em cada briefing, lido do `PLAN.md` da fase. Fase sem esforço definido usa `medium` para tudo. A tabela de cada fase fica no `PLAN.md` (fases detalhadas) e no `docs/ROADMAP.md` (etapas futuras).

## Etapa atual e etapas futuras

**Etapa atual: laboratório de componentes** (épico `epic/lab`, fases L1 e L2 no `PLAN.md`; descrição em [`lab/README.md`](lab/README.md)). A etapa 10 está concluída (correções da rodada 7 do Cowork; schema v9 e MCP 0.4.0 sem mudança). O dono considerou o marco "Uso real" **alcançado em 2026-10-16** e a próxima etapa é a **Biblioteca** ([`docs/ROADMAP.md`](docs/ROADMAP.md)), depois do laboratório. Testes guiados por [`docs/TESTING.md`](docs/TESTING.md); o prompt do testador do Cowork, para uma rodada completa ou dirigida, está em [`docs/TESTING-COWORK.md`](docs/TESTING-COWORK.md). Não implementar nada do roadmap antes de o `PLAN.md` detalhar a etapa. As funcionalidades do núcleo são genéricas: nada específico de Figma ou de outra origem. Plataformas, linguagens e componentes de código entram só pelas especializações: nenhum nome de plataforma no código do núcleo.

- **Etapa 2 — Especialização (concluída):** seção 13 do plano histórico (`docs/history/PLAN-etapas-1-2.md`), fases 13 a 17.
- **Etapa 2.1 — Revisão técnica (concluída):** fases 18 a 25 (detalhes em `docs/history/PLAN-etapa-2-1.md`).
- **Etapa 2.2 — Segunda revisão técnica (concluída):** fases 26 e 27 concluídas, 28 dispensada (histórico em `docs/history/PLAN-etapa-2-2.md`).
- **Etapa 2.3 — Redesign da interface (concluída):** fases R1 a R9 concluídas e R10 movida para Evoluções no ROADMAP (histórico em `docs/history/PLAN-etapa-2-3.md`; especificação em `docs/redesign/HANDOFF.md`).
- **Etapa 2.4 — Privacidade garantida por CSP (concluída):** CSP gerada no build; ver `docs/ARCHITECTURE.md`.
- **Etapa 2.5 — Trava de marcações e imagens (concluída):** `locked` no schema v5, regras em `src/model/locks.ts`, cadeado na interface e no canvas (histórico em `docs/history/PLAN-etapa-2-5.md`).
- **Etapa 3a — Servidor MCP, base (concluída):** histórico em `docs/history/PLAN-etapa-3a.md`; uso em `docs/MCP.md` e `docs/AGENT-GUIDE.md`.
- **Etapa 3b — Referências de código (concluída):** histórico em `docs/history/PLAN-etapa-3b.md`; formato em `docs/SPEC-FORMAT.md` e `docs/FORMAT.md` (schema v7), uso em `docs/MCP.md` e `docs/AGENT-GUIDE.md`.
- **Etapa 4 — Propostas de alteração com revisão (concluída):** histórico em `docs/history/PLAN-etapa-4.md` (inclui o roteiro de teste manual da etapa 4); formato em `docs/PROPOSAL-FORMAT.md`, `docs/FORMAT.md` (schema v8) e `docs/SPEC-FORMAT.md` (especialização v3), uso em `docs/MCP.md` e `docs/AGENT-GUIDE.md` (MCP 0.3.0, sem `apply_changes`), design em `docs/redesign/HANDOFF-PROPOSALS.md`.
- **Etapa 5 — Pré-voo para uso real (concluída):** histórico em `docs/history/PLAN-etapa-5.md` (com as decisões consolidadas dos PRs e os prompts do coordenador e do testador do Cowork, `docs/history/etapa-5-*.md`); guia do testador em `docs/TESTING.md`; MCP 0.3.1.
- **Etapa 6 — Correções da primeira rodada de testes (concluída):** histórico em `docs/history/PLAN-etapa-6.md` (com as decisões consolidadas dos PRs; ao lado, o relato da rodada 1, `relato-2026-10-11.md`, e os prompts do coordenador e do testador do Cowork, `docs/history/etapa-6-*.md`); recentes de pasta na tela inicial; MCP 0.3.2.
- **Etapa 7 — Correções da rodada dirigida (concluída):** histórico em `docs/history/PLAN-etapa-7.md` (com as decisões consolidadas dos PRs; ao lado, o relato da rodada 2, `relato-2026-10-12-dirigida.md`, e o prompt do coordenador, `docs/history/etapa-7-coordenador.md`); foco que nunca cai no `body` ao fechar diálogos (`returnFocus` do `Dialog`); MCP 0.3.2 sem mudança.
- **Etapa 8 — Consolidação por subsistema (concluída):** histórico em `docs/history/PLAN-etapa-8.md` (com as decisões consolidadas dos PRs, a auditoria e o portão; ao lado, as notas de desenho das fases em `docs/history/etapa-8-notas/`, a segunda leitura da entrega, `auditoria-etapa-8.md`, os relatos do portão e da dirigida, `relato-2026-10-13-portao.md` e `relato-2026-10-14-dirigida.md`, e o prompt do coordenador, `docs/history/etapa-8-coordenador.md`; origem na revisão técnica `docs/history/revisao-tecnica-2026-10-12.md`); sessão com fila única, revisão pelo projeto à vista, um dono de foco por fechamento, guia do testador para quem testa à mão; MCP 0.3.4.
- **Etapa 9 — Ajustes do teste manual avançado (concluída):** histórico em `docs/history/PLAN-etapa-9.md` (com as decisões consolidadas dos PRs #145 a #152); apagar proposta que não está aberta, `path` (arquivo do símbolo) no `code` da especialização, `codeRef` removido (schema v9, MCP 0.4.0) e Detalhes na revisão com o painel normal e um marcador por campo (briefing `docs/redesign/BRIEF-REVIEW-DETAILS.md` e handoff `docs/redesign/HANDOFF-REVIEW-DETAILS.md`, referências). Testada pela rodada 7 do Cowork (dirigida, `relato-2026-10-15-dirigida.md`): 58 ✅, 1 achado baixo, levado à etapa 10.
- **Etapa 10 — Correções da rodada dirigida da etapa 9 (concluída):** histórico em `docs/history/PLAN-etapa-10.md` (com as decisões consolidadas dos PRs #154 e #155 e do fechamento; ao lado, o relato da rodada 7, `relato-2026-10-15-dirigida.md`); a nota sugerida e o foco ao rejeitar pelo marcador, a seleção depois de rejeitar a criação e o guia do testador (estado de `images/`, cartão de texto, faixa da migração, extensão que não injeta arquivos).
- **Etapas futuras:** a ordem está em [`docs/ROADMAP.md`](docs/ROADMAP.md) (marco de uso real e evoluções). Não implementar nada delas antes de o `PLAN.md` detalhar a etapa.
