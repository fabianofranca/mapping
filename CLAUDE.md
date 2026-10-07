# CLAUDE.md

## Projeto

Mapping: app web para marcar áreas retangulares em imagens, organizar em camadas e anotar com pares chave-valor, salvando tudo num `mapping.json` ao lado das imagens.

**Leia o `PLAN.md` antes de qualquer tarefa** (resumo do produto e fases pendentes). Trabalhe **uma fase por vez**, na ordem, e marque os checkboxes concluídos no próprio PR. A referência atual está em `docs/` (`ARCHITECTURE.md`, `FORMAT.md`, `SPEC-FORMAT.md`); o plano das etapas concluídas está em `docs/history/` (inclui o roteiro de teste manual, seção 13.9).

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
npm run lint      # eslint + prettier --check
npm run typecheck # tsc --noEmit
```

Antes de finalizar qualquer tarefa: `npm run lint && npm run typecheck && npm test && npm run build` precisam passar.

## Regras de arquitetura

- `src/model/` contém só funções puras e imutáveis, sem DOM. Toda regra de negócio fica aqui e é testada.
- **`src/model/` não pode depender de APIs de navegador** (DOM, `window`, `document`, IndexedDB, File System Access, `createImageBitmap`, `Image`, canvas, `localStorage`). Ele será reutilizado por um servidor MCP em Node na etapa 3. Use apenas APIs disponíveis tanto no navegador quanto no Node (ex: `crypto.randomUUID()`). Tudo que depende de navegador (leitura de dimensões da imagem, EXIF, bitmaps) fica em `src/storage/` ou `src/canvas/` e entrega dados já prontos ao `model/`. A regra é imposta automaticamente: ESLint (`no-restricted-globals`/`no-restricted-imports` em `src/model/**`) e o projeto `model` do Vitest, que roda `tests/model/` com `environment: 'node'`.
- Toda mutação do projeto passa por uma action do store. Nunca altere o estado diretamente num componente.
- O estado do projeto (JSON + undo) é separado do estado da UI (seleção, visibilidade, modo, viewport).
- Consultas por id e agrupamentos do projeto usam `projectIndex(p)` (`src/model/projectIndex.ts`, memoizado por versão do projeto), nunca `find`/`filter` dentro de laços. O estado derivado do editor (camadas visíveis, indicadores, visibilidade, pendências, lista) fica em `src/store/derived.ts` e é lido por canvas, painel e lista, sem recalcular.
- O canvas desenha no máximo uma vez por quadro (`requestAnimationFrame`); pan e zoom não recalculam dados que dependem só do projeto.
- Um gesto (arrastar/redimensionar) gera **uma** entrada no histórico de undo.
- Konva fica isolado em `src/canvas/` (`CanvasController` imperativo). Componentes Preact não importam Konva, exceto `CanvasHost`. Não usar `react-konva`.
- As coordenadas das marcações são **sempre** em pixels da imagem original. Conversões de tela/canvas ficam só em `src/canvas/`.
- Nenhuma string de UI hardcoded: tudo via `t()` com chaves em `src/i18n/pt-BR.ts` e `src/i18n/en-US.ts`.
- Nenhum valor de design fixo (cor, espaço, raio, fonte, opacidade, duração, z-index) fora dos tokens: use `var(--…)` dos tokens de `src/theme/tokens.ts` (fonte única, temas claro e escuro). Borda de controle usa `--color-border-control`; `--color-border` é só divisória. O canvas lê os tokens do tema. Um teste (`tests/theme/tokenLiterals.test.ts`) procura literais no CSS.
- Controles de formulário e botões vêm de `src/ui/controls/` (`Button`, `IconButton`, `TextField`, `Select`, `Choice`, `Segmented`, `Tabs`, `Tooltip`) e ícones de `<Icon name="…" />` (`src/ui/icons.tsx`); não crie botão, campo ou ícone avulso. Altura, raio e ícone seguem a densidade (`--control-*`): 28px/16px no desktop, 44px/20px no celular.

## Restrições do ambiente de execução

- O `index.html` precisa funcionar em **`file://` no Chrome/Edge desktop** e hospedado no **GitHub Pages**:
  - nada de import de módulos externos em runtime nem requisições de rede;
  - o service worker só é registrado quando `location.protocol === 'https:'`;
  - detecte os recursos em runtime (`showDirectoryPicker`, IndexedDB, `navigator.canShare`) e degrade com elegância;
  - o `dist/index.html` leva uma **CSP** em `<meta>` gerada no build (`pwa/csp.ts`; hashes dos blocos embutidos, sem `'unsafe-inline'`/`'unsafe-eval'`, `connect-src 'none'`). Por isso: sem `style=""` nem handlers inline no HTML, sem `eval`/`new Function`, sem `setAttribute('style')`, sem `fetch`/XHR/WebSocket (estilo dinâmico só por JS: `el.style.x`, objeto `style` do Preact). Não escreva a CSP à mão no `index.html`. Detalhes em `docs/ARCHITECTURE.md`.
- **Desktop primeiro, utilizável no celular**: o layout principal é o de desktop (≥ 900 px, mouse e teclado). Todo layout também precisa funcionar em 380 px de largura com toque, com áreas de toque de pelo menos 24 px (alças) e 44 px (botões) no celular. Uma mudança só está pronta quando funciona nos dois.
- Envolva todo acesso a `localStorage`/IndexedDB em try/catch.

## Código

- Identificadores e nomes de arquivos em inglês. Comentários e documentação podem ser em português.
- TypeScript strict, sem `any` (use `unknown` + validação).
- Componentes pequenos e funcionais; lógica fora dos componentes.
- Não adicione dependências além da stack acima sem justificar no PR.

## Fluxo de trabalho

- O dono do projeto usa o Claude Code **pelo celular** e não roda nada localmente.
- Um branch e um PR por fase (ou por parte de uma fase, se ela for grande).
- Toda descrição de PR contém:
  1. **Resumo** do que mudou;
  2. **Como testar**: passos manuais objetivos no desktop e no celular, lembrando que o deploy do branch pode ser disparado pelo `workflow_dispatch`;
  3. **Decisões tomadas** que não estavam no `PLAN.md`.
- Se algo no `PLAN.md` estiver ambíguo ou for inviável, registre a dúvida no PR em vez de inventar comportamento grande. Para detalhes pequenos, decida, siga e documente.

## Etapa atual e etapas futuras

- **Etapa 2 — Especialização (concluída):** seção 13 do plano histórico (`docs/history/PLAN-etapas-1-2.md`), fases 13 a 17.
- **Etapa 2.1 — Revisão técnica (concluída):** fases 18 a 25 (detalhes em `docs/history/PLAN-etapa-2-1.md`).
- **Etapa 2.2 — Segunda revisão técnica (concluída):** fases 26 e 27 concluídas, 28 dispensada (histórico em `docs/history/PLAN-etapa-2-2.md`).
- **Etapa 2.3 — Redesign da interface (concluída):** fases R1 a R9 concluídas e R10 movida para Evoluções no ROADMAP (histórico em `docs/history/PLAN-etapa-2-3.md`; especificação em `docs/redesign/HANDOFF.md`).
- **Etapa 2.4 — Privacidade garantida por CSP (concluída):** CSP gerada no build; ver `docs/ARCHITECTURE.md`.
- **Etapa 2.5 — Trava de marcações e imagens (concluída):** `locked` no schema v5, regras em `src/model/locks.ts`, cadeado na interface e no canvas (fases F1 a F6 no `PLAN.md`).
- **Etapas futuras:** a ordem está em [`docs/ROADMAP.md`](docs/ROADMAP.md) (3 servidor MCP, 4 Figma, marco de uso real e evoluções). Não implementar nada delas antes de o `PLAN.md` detalhar a etapa.
