# Arquitetura

Aplicação Preact/TypeScript sem servidor. O estado do projeto é um objeto JSON imutável; tudo o que muda esse objeto passa por uma _action_ do store.

## Camadas

```
model  →  store  →  storage / canvas / ui (app)
```

Cada camada só conhece as da esquerda.

| Camada     | Pasta                                   | Responsabilidade                                                                                                                    |
| ---------- | --------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `model`    | `src/model/`                            | Tipos do `mapping.json`, schema (zod), invariantes, migrações e **todas as regras de negócio**, como funções puras e imutáveis.     |
| `store`    | `src/store/`                            | Estado do projeto com desfazer (`history.ts`), actions (`project.ts`), sessão de persistência (`session.ts`), UI e estado derivado. |
| `storage`  | `src/storage/`                          | Pasta (File System Access), projeto local (IndexedDB), zip, leitura de imagens/EXIF, autosave.                                      |
| `canvas`   | `src/canvas/`                           | Konva isolado: `CanvasController` imperativo, renderers, entrada (ponteiro/teclado) e viewport.                                     |
| `ui`/`app` | `src/ui/`, `src/app/`                   | Componentes Preact: tela inicial, editor, painéis e diálogos; `controller.ts` orquestra a abertura/criação de projetos.             |
| apoio      | `src/i18n/`, `src/theme/`, `src/utils/` | Textos (pt-BR/en-US), tokens e CSS do tema, erros (`report.ts`), canal main/preview, `localStorage` seguro.                         |

## Fluxo de dados

```
ação do usuário
  → action (store/project.ts)
  → operação pura (model/…): (Project) => Project
  → snapshot no histórico (store/history.ts) + project signal
  → derived (store/derived.ts): camadas visíveis, indicadores, pendências, lista…
  → canvas (um desenho por quadro) e UI (leem os computed)
  → autosave (storage/autosave.ts) → mapping.json (pasta ou IndexedDB)
```

- **Store** (`createProjectStore`): guarda o projeto atual e as pilhas `past`/`future` de snapshots (limite de 100). Uma operação que lança erro de regra volta como `ActionResult` com `ok: false`, sem alterar o estado. Um gesto (arrastar/redimensionar) é agrupado e vira **uma** entrada de desfazer.
- **Estado do projeto × estado da UI**: o JSON e o desfazer ficam no store; seleção, camadas visíveis, modo (navegar/desenhar), painel aberto e viewport ficam em `EditorUi` (`store/ui.ts`) e nunca vão para o arquivo nem para o histórico.
- **Estado derivado** (`createEditorDerived`): `computed` por editor, calculados uma vez e lidos por canvas, painel e lista. Dependem só do projeto e da UI, **não do viewport**: pan e zoom não os recalculam.
- **Índice** (`projectIndex(p)`): mapas por id e agrupamentos (marcações filhas, anotações por marcação e por dono, backlinks), memoizados em `WeakMap<Project, …>`: um projeto novo (nova versão) reconstrói o índice uma vez; leituras seguintes são O(1).
- **Persistência** (`openSession`): serializa depois de cada mudança (autosave com atraso e escritas em fila), grava as imagens e as cópias de `specs/`, e nunca deixa o `mapping.json` apontar para um arquivo apagado: arquivos removidos vão para uma `trash` e só são descartados quando nenhum snapshot do histórico os referencia.
- **Bitmaps** (`displayImages.ts`): as imagens exibidas são carregadas sob demanda; `retain(paths)` fecha os bitmaps que o projeto não usa mais. Um arquivo que volta pelo desfazer é recarregado.
- **Erros**: `reportError(contexto, erro)` registra no console e guarda os últimos 20; o menu "Diagnóstico" os lista com botão "Copiar".

## Regras e o porquê

| Regra                                                                                                                                                                                                 | Por quê                                                                                                                                 |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| `src/model/` não usa APIs de navegador (DOM, `window`, IndexedDB, `Image`, canvas, `localStorage`…). Só o que existe também no Node (ex: `crypto.randomUUID()`).                                      | O modelo será reutilizado por um servidor MCP em Node (etapa 3). ESLint e o projeto `model` do Vitest (ambiente `node`) impõem a regra. |
| Dependências de navegador (dimensões da imagem, EXIF, bitmaps) ficam em `storage/` ou `canvas/` e entregam dados prontos ao `model/`.                                                                 | Mesmo motivo; o modelo recebe números, não imagens.                                                                                     |
| Toda mutação passa por uma action do store. Componentes nunca alteram o estado diretamente.                                                                                                           | Garante desfazer, autosave e invariantes em um só lugar.                                                                                |
| Um gesto gera **uma** entrada de desfazer.                                                                                                                                                            | Desfazer um arrasto não pode exigir dezenas de toques.                                                                                  |
| Consultas por id e agrupamentos usam `projectIndex(p)`, nunca `find`/`filter` em laços.                                                                                                               | Mantém os orçamentos por quadro (projetos com centenas de marcações).                                                                   |
| O canvas desenha no máximo uma vez por quadro (`requestAnimationFrame`); o `effect` só marca "sujo".                                                                                                  | Pan/zoom fluidos no celular.                                                                                                            |
| Konva só em `src/canvas/` (e `CanvasHost`). Sem `react-konva`.                                                                                                                                        | O canvas é imperativo e testável sem a árvore de componentes.                                                                           |
| Coordenadas das marcações **sempre** em pixels da imagem original; conversões de tela/canvas só em `src/canvas/`.                                                                                     | O agente que lê o JSON recorta a imagem original, sem conhecer a tela.                                                                  |
| Nenhuma string de UI hardcoded: tudo via `t()` com chaves em `src/i18n/pt-BR.ts` e `en-US.ts` (um teste exige as mesmas chaves e `{parâmetros}`).                                                     | Dois idiomas sem divergência.                                                                                                           |
| Nenhuma cor hardcoded: variáveis CSS do tema (`tokens.css`, claro e escuro); o canvas lê os mesmos tokens.                                                                                            | Tema escuro consistente.                                                                                                                |
| `index.html` funciona em `file://`: sem módulos externos nem rede em runtime; service worker só em `https:`; recursos (`showDirectoryPicker`, IndexedDB, `navigator.canShare`) detectados em runtime. | Uso offline, em arquivo avulso e no GitHub Pages.                                                                                       |
| Todo acesso a `localStorage`/IndexedDB em `try/catch`.                                                                                                                                                | Modo privado e armazenamento bloqueado não podem derrubar a app.                                                                        |
| Desktop primeiro, utilizável no celular: layouts testados no desktop e em 380 px; alças ≥ 24 px e botões ≥ 44 px de toque.                                                                            | O uso principal é no desktop, mas a app precisa continuar utilizável no celular.                                                        |
| TypeScript strict, sem `any` (use `unknown` + validação).                                                                                                                                             | Dados externos (JSON, arquivos) são sempre validados.                                                                                   |

## Onde fica cada coisa

### `src/model/`

- `types.ts`, `schema.ts`, `serialization.ts`, `migrations.ts`: tipos do `mapping.json` v4, validação (zod), (de)serialização e migração de versões antigas.
- `invariants.ts`: `validateProject` (regras entre coleções: ids únicos, contenção, hierarquia sem ciclos, vínculos).
- `layers.ts`, `images.ts`, `markings.ts`, `annotations.ts`, `hierarchy.ts`, `geometry.ts`: operações puras por entidade.
- `spec.ts`, `specLookup.ts`, `specializations.ts`: formato e validação da especialização, resolução de tipos e ciclo de vida no projeto (aplicar, atualizar, remover).
- `typed.ts`, `typedDisplay.ts`, `refs.ts`, `links.ts`, `issues.ts`: anotações tipadas, referências fortes e pendências ("incompletas", calculadas e nunca gravadas).
- `projectIndex.ts`, `display.ts`, `listing.ts`: índice e dados de exibição (visibilidade, indicadores, lista).
- `imageOptimization.ts`: decisões de otimização na importação (funções puras).

### `src/store/`

- `history.ts`: `createProjectStore` (projeto + desfazer/refazer). `project.ts`: `createProjectActions`.
- `session.ts` + `displayImages.ts`: persistência e bitmaps (ver acima). `ui.ts`: estado da UI. `derived.ts`: estado derivado. `settings.ts`: preferências (tema, idioma, modo de exibição…).

### `src/storage/`

- `folder.ts` (pasta), `local.ts` (IndexedDB), `zip.ts` (exportar/importar), `autosave.ts`, `imageImport.ts` e `exif.ts` (leitura e otimização de imagens), `existingImages.ts`, `share.ts`.
- Todos implementam a interface `ProjectStorage` (`types.ts`); a sessão não sabe se é pasta ou local.

### `src/canvas/`

- `CanvasController.ts`: orquestrador fino; monta o quadro, agenda a renderização e conecta os módulos. `CanvasHost.tsx`: ponte com o Preact.
- `renderers/`: `images`, `markings`, `semanticCard`, `overlay` (seleção, alças, rascunho, alvo de soltar). Recebem dados prontos e só atualizam nós do Konva (com pool de nós reaproveitado).
- `input/`: `pointer` (eventos → `gestureMachine` → intenções), `keyboard`. `gestureMachine.ts` é uma máquina de estados pura e testada.
- `viewportController.ts`, `viewport.ts`: pan, zoom, enquadrar, centralizar.
- `markingGeometry.ts`, `imageGeometry.ts`, `semanticText.ts`, `theme.ts`: geometria, zoom semântico e leitura dos tokens do tema.

### `src/app/` e `src/ui/`

- `app/App.tsx`: alterna entre `Home` e `Editor`. `app/controller.ts`: abrir/criar projetos e exportar. `app/Editor.tsx` compõe `EditorTopBar`, `EditorBottomBar`, `EditorPanel`, `EditorDialogs`.
- `ui/EditorContext.tsx`: contexto Preact com `session`, `store`, `actions`, `ui`, `derived` e o `CanvasController`; os componentes filhos o leem em vez de receber esses objetos por props.
- `app/useEditorDialogs.ts` (um estado com união discriminada para todos os diálogos), `useImageIntake.tsx` (adicionar, colar, arrastar, trocar imagens), `useEditorShortcuts.ts`.
- `ui/`: painéis (`SelectionPanel`, `AnnotationsPanel`, `MarkingTree`), `AnnotationEditor`, `TypedFields`, `LayersDialog`, `SpecsDialog`, `ListView`, `DiagnosticsDialog`…

### Estilos (`src/theme/`)

`tokens.css` (variáveis dos temas claro e escuro) e, importados por `main.tsx` nesta ordem: `base.css` (reset, botões, campos, avisos), `layout.css` (telas, barras, gaveta, banners), `panels.css` (painéis, árvore, camadas, anotações, lista), `canvas.css` (área do canvas), `forms.css` (campos tipados, referências, tabelas) e `dialogs.css` (diálogos, ajuda, diagnóstico). A ordem importa: arquivos posteriores vencem empates de especificidade.

### Testes (`tests/`)

Espelham `src/`. `tests/model` roda em Node; `tests/components` usa `@testing-library/preact`; `tests/model/performance.test.ts` e `tests/canvas/renderPerformance.test.ts` guardam os orçamentos por quadro (fixtures em `largeProject.ts` e `largeTypedProject.ts`); `tests/e2e/` roda com Playwright no `dist/index.html` (desktop e celular com toque emulado); `tests/i18n/specHelp.test.ts` garante que a ajuda de especializações e o `docs/SPEC-FORMAT.md` não divergem.

### Build e PWA

`vite.config.ts` usa `vite-plugin-singlefile` (um só `index.html`) e carimba `pwa/sw.js` com um hash do build, que é o que faz o navegador detectar "nova versão". `VITE_CHANNEL=preview` (ver `src/utils/channel.ts`) separa armazenamento, manifest e service worker do preview.
