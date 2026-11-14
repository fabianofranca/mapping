# CLAUDE.md

## Projeto

Mapping: app web para marcar áreas retangulares em imagens, organizar em camadas e anotar com pares chave-valor, salvando tudo num `mapping.json` ao lado das imagens.

**Antes de qualquer tarefa de uma etapa, leia a issue dela no GitHub e o [`docs/PROCESS.md`](docs/PROCESS.md)** (rótulo `ready` ou `in-progress`, com as sub-issues de fase e os comentários; ver "Planejamento nas issues" no `docs/PROCESS.md`). Trabalhe **uma fase por vez**, na ordem, e marque os checkboxes concluídos na sub-issue da fase. A referência atual está em `docs/` (`ARCHITECTURE.md`, `FORMAT.md`, `SPEC-FORMAT.md`, `COMMENT-FORMAT.md`, `MCP.md`, `AGENT-GUIDE.md`, `DESIGN-SYSTEM.md`); o plano das etapas concluídas está nas issues fechadas com o rótulo `in-progress` (o que veio antes delas está no histórico do git). Os roteiros de teste manual e o template do relato estão em `docs/TESTING.md`; o prompt do testador da nuvem (sessão do Claude Code sem o dono), em `docs/TESTING-NUVEM.md`.

Skills do Claude Code ficam em `.claude/skills/`: **`spec-author`** escreve e valida especializações (`docs/SPEC-FORMAT.md`); o prompt que a invoca só especifica a origem, o `id`, a `formatVersion` e as plataformas (modelo no fim da própria skill). **`detalhar-backlog`** coordena subagentes Opus (ferramenta `Agent`, no esforço high ou medium pelos critérios da skill, sem prompt manual) que detalham como etapas `ready` todas as `roadmap` e `bug` que ainda não estão `ready`: antes, propõe juntar issues num épico só, e as perguntas chegam ao dono pelo seletor de perguntas (`docs/FLOW.md`). **`implementar-fila`** coordena a implementação em sequência das `ready` (ordem pelo `**Depende de:**`), com fases, testador, correções até zerar os ❌ e o painel "Fila de desenvolvimento"; o merge de cada épico espera o dono, salvo `mesclar=auto` escrito por ele na chamada (`docs/FLOW.md`). Para usar a `spec-author` no repositório do código que está sendo mapeado, copie a pasta para o `.claude/skills/` dele ou para `~/.claude/skills/`. `examples/workspace/` é o esqueleto de uma pasta central de mapeamentos (servidor, raízes, skill e `AGENTS.md` para qualquer cliente MCP). O que cada exemplo mostra e como abri-lo está em `examples/README.md`. O **guia interativo** (`public/guia/`, gerado) e o **projeto de exemplo** (`examples/exemplo-completo/` e o zip) saem de uma fonte só; ver `docs/GUIDE.md`. `viewer/` é o visualizador embutível (pacote `mapping-viewer`), com a demonstração em React em `viewer/demo/`; estrutura e comandos em `viewer/README.md`.

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
npm run test:durations # regenera tests/support/durations.json (tempos por arquivo que balanceiam os 4 shards do CI; roda a suíte com cobertura)
npm run test:perf # só os orçamentos de desempenho (sem cobertura; o CI roda separado)
npm run test:scale # testes de crescimento (n e 4n marcações, razão < 6×), fora do npm test; roda no CI depois do test:perf
npm run perf:canvas # mede o canvas num Chromium de verdade contra o dist/index.html (2.000 e 5.000 marcações; quadros de pan, zoom, edição, arrasto e abertura; tabela no stdout; opções `--setas <n>`, `--sem-setas`, `--componentes` e `--vezes <k>` (mediana de k execuções)); fora do CI; localmente: npm run build e PLAYWRIGHT_CHROMIUM_EXECUTABLE=<chrome>
npm run test:e2e  # Playwright contra dist/index.html; roda no CI (localmente: npm run build e PLAYWRIGHT_CHROMIUM_EXECUTABLE=<chrome>)
npm run build:mcp # gera dist-mcp/mapping-mcp.js (servidor MCP, etapa 3a)
npm run dev:viewer # demonstração do visualizador embutível num hospedeiro React (viewer/demo)
npm run build:viewer # gera dist-viewer/ (mapping-viewer.js, mapping-viewer-react.js e types/)
npm run build:example # gera examples/exemplo-completo.zip e materializa examples/exemplo-completo/specs/ das fontes (zip conferido por teste)
npm run build:guia # gera public/guia/index.html (o guia interativo; o `npm run build` já roda; conferido por teste)
npm run lint      # eslint + prettier --check
npm run lint:ci   # o mesmo lint com cache em .cache/ (só o CI usa)
npm run typecheck # tsc --noEmit (app e mcp/); os tipos só são checados aqui: `build` e `build:mcp` não rodam o `tsc`
```

Antes de finalizar qualquer tarefa: `npm run lint && npm run typecheck && npm test && npm run build` precisam passar.

## Regras de arquitetura

- `src/model/` contém só funções puras e imutáveis, sem DOM. Toda regra de negócio fica aqui e é testada.
- **`src/model/` não pode depender de APIs de navegador** (DOM, `window`, `document`, IndexedDB, File System Access, `createImageBitmap`, `Image`, canvas, `localStorage`). Ele será reutilizado por um servidor MCP em Node na etapa 3. Use apenas APIs disponíveis tanto no navegador quanto no Node (ex: `crypto.randomUUID()`). Tudo que depende de navegador (leitura de dimensões da imagem, EXIF, bitmaps) fica em `src/storage/` ou `src/canvas/` e entrega dados já prontos ao `model/`. A regra é imposta automaticamente: ESLint (`no-restricted-globals`/`no-restricted-imports` em `src/model/**`) e o projeto `model` do Vitest, que roda `tests/model/` com `environment: 'node'`.
- Toda mutação do projeto passa por uma action do store. Nunca altere o estado diretamente num componente.
- O estado do projeto (JSON + undo) é separado do estado da UI (seleção, visibilidade, modo, viewport).
- Consultas por id e agrupamentos do projeto usam `projectIndex(p)` (`src/model/projectIndex.ts`, memoizado por versão do projeto), nunca `find`/`filter` dentro de laços. O estado derivado do editor (camadas visíveis, indicadores, visibilidade, pendências, lista) fica em `src/store/derived.ts` e é lido por canvas, painel e lista, sem recalcular.
- **Espaços, pertencimento e setas:** a marcação vive no espaço do container (pixels dele) ou no do canvas (`containerId` nulo); quem contém quem é decidido só pela geometria, por `settleHierarchy` (`src/model/hierarchySettle.ts`), no fim de toda operação do modelo que muda geometria (as prévias de gesto usam `settle: false`; o gesto termina repetindo a operação com `settle: true`, numa entrada de desfazer). O assentar do fim da operação (`settleFrom`) é recortado ao que ela mexeu, com o mesmo resultado do assentar inteiro (`settleHierarchy` sem `before`, que continua assentando tudo). Nunca se escolhe o pai à mão nem se calcula interseção fora do modelo. A seta (`arrows`) é uma marcação que aponta, fora da árvore de pertencimento; a flutuante (`floating`) também.
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
  - o `dist/index.html` leva uma **CSP** em `<meta>` gerada no build (`pwa/csp.ts`; hashes dos blocos embutidos, sem `'unsafe-inline'`/`'unsafe-eval'`, `connect-src 'none'`). Por isso: sem `style=""` nem handlers inline no HTML, sem `eval`/`new Function`, sem `setAttribute('style')`, sem `fetch`/XHR/WebSocket (estilo dinâmico só por JS: `el.style.x`, objeto `style` do Preact). A CSP da app também libera `https:`/`http:` no `img-src` e exige Trusted Types: nada de `innerHTML`/`outerHTML`/`insertAdjacentHTML`/`dangerouslySetInnerHTML` com conteúdo nem `script.src` (monte o DOM por JSX ou `textContent`), e imagem por URL só pelo carregador de `src/canvas/components/` (ou `src/storage/` para `blob:`; regra de lint). O guia e a demonstração do visualizador usam o perfil `static` (sem imagem remota nem Trusted Types). Não escreva a CSP à mão no `index.html`. Detalhes em `docs/ARCHITECTURE.md`.
- **Só desktop**: janela mínima de 900×720 px (tokens `size-app-min` e `size-app-min-height`), mouse e teclado; toque simples funciona (clicar, arrastar, rolar e a pinça), gestos de celular não. Abaixo de 900 px de largura ou de 720 px de altura a app mostra o aviso "Abra numa janela maior" no lugar da tela, sem desmontar nada (o projeto continua aberto e gravando). Não há layout de celular (decisão da fase 5.8). Num tablet Android, com janela de pelo menos 900×720 e toque simples, a app funciona sem garantia; o projeto em pasta passa pela pasta do Android, mais lenta que a do desktop.
- Envolva todo acesso a `localStorage`/IndexedDB em try/catch.

## Código

- Identificadores e nomes de arquivos em inglês. Comentários e documentação podem ser em português.
- TypeScript strict, sem `any` (use `unknown` + validação).
- Componentes pequenos e funcionais; lógica fora dos componentes.
- Não adicione dependências além da stack acima sem justificar no PR.
- **Complexidade por função:** função nova ou alterada fica com complexidade ciclomática até 10 (`complexity` do ESLint, erro em `src/**` e `mcp/**`); o legado acima disso está em `eslint-suppressions.json`, onde a contagem por arquivo só pode cair.
  - Quem reduz uma função suprimida abaixo do limite roda `npx eslint --prune-suppressions` no mesmo PR (sem isso o `lint` falha por supressão sem uso).
  - Não se usa `eslint-disable` para `complexity`: a exceção fica no arquivo de supressões, visível no diff.
  - Função já suprimida que a fase precisou tocar não exige redução (basta não criar outra acima do limite no mesmo arquivo); a dívida grande vira issue `roadmap`, não refatoração no meio da fase.

## Fluxo de trabalho (resumo)

- O dono do projeto usa o Claude Code **pelo celular** e não roda nada localmente.
- **Início de sessão:** a sessão trabalha direto na pasta do repositório (sem worktree, salvo pedido do dono), no branch que estiver em uso. Antes de qualquer tarefa nova, vá para a `main` atualizada (`git switch main && git pull --ff-only`) e crie dali o branch do épico; se houver alteração não commitada ou o branch em uso não estiver mesclado, pergunte ao dono antes de trocar.
- Nada se implementa sem uma issue `ready` (ou `in-progress`, ao retomar), e tudo chega à `main` por um épico (`epic/<nome>`, com PR para a `main`); cada fase é um branch curto com PR para o épico. A exceção é a via rápida: ajuste pequeno de processo vai num épico de um PR só, sem `ready` nem fases, pelo skill `/via-rapida` (`.claude/skills/via-rapida/SKILL.md`; "salvo a via rápida").
- Antes de finalizar qualquer tarefa: `npm run lint && npm run typecheck && npm test && npm run build` precisam passar.
- **Antes de abrir issue, branch, PR ou sessão, leia o [`docs/PROCESS.md`](docs/PROCESS.md)** (as seções que valem para a tarefa): planejamento nas issues, rótulos, bugs, fluxo automatizado, revisão de código, roteiros de teste, descrição de PR, uso de modelos e etapas. As mensagens prontas estão em [`docs/FLOW.md`](docs/FLOW.md).

## Mapping workspace

`mappings-workspace/` holds the Mapping projects used to design and evolve this app (screens, flows and components mapped as markings and annotations). It is isolated from the app code: ignored by eslint and prettier, and not part of any build. Read `mappings-workspace/AGENTS.md` before touching it. The `mapping` MCP server is configured in `.mcp.json` (it runs `mappings-workspace/serve.mjs`, which in cloud sessions runs `setup.sh` first). Never edit `mapping.json`, `specs/` or `proposals/` by hand: use the MCP tools.
