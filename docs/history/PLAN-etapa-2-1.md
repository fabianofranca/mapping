# Histórico — Etapa 2.1, revisão técnica (seção 14 do antigo PLAN.md)

> Arquivo histórico: seção 14 do `PLAN.md` sem alterações (as fases 18 a 24 estão concluídas; a 25 consta no `PLAN.md`). As seções 1 a 13 estão em [`PLAN-etapas-1-2.md`](PLAN-etapas-1-2.md).

---

## 14. Etapa 2.1 — Revisão técnica

> Resultado de uma revisão de arquitetura (Preact/TypeScript) do repositório completo, feita após a Fase 17. Estado no momento da revisão: lint, typecheck, 750 testes e build passando; `dist/index.html` com 593 kB (173 kB gzip).
>
> **Regra geral desta etapa:** salvo onde a tarefa diz o contrário, **nenhuma mudança de comportamento visível**. Refatorações precisam manter todos os testes verdes e passar no roteiro manual da 13.9.

### 14.1 Pontos fortes (manter)

- `src/model/` puro, imutável e protegido por ESLint + testes em Node: pronto para o MCP.
- Store com desfazer por snapshots e gestos agrupados (`history.ts`), salvamento automático serializado (`autosave.ts`), persistência que nunca deixa o `mapping.json` apontando para arquivo apagado (`session.ts`).
- Gestos em máquina de estados pura e testada; pool de nós do Konva reaproveitado entre renderizações.
- TypeScript estrito com `noUncheckedIndexedAccess`, sem `any`, sem `!`.

### 14.2 Achados

#### P0 — Risco de perda de dados ou de regressão sem aviso

1. **PRs não são validados pelo CI.** O `deploy.yml` só roda em push na `main` e no `workflow_dispatch`, e roda `test` + `build` — o **lint nunca roda no CI**. Como os merges são feitos pelo celular, sem rodar nada localmente, um PR quebrado só é descoberto depois do merge.
2. **O preview de branch substitui a produção e compartilha os dados dela.** O `workflow_dispatch` publica o branch no lugar da `main`, na mesma origem. O IndexedDB, o `localStorage` e o service worker são os mesmos. Um branch com migração de schema (ex: v4 → v5) **migra os projetos locais do celular**; ao voltar para a `main`, eles abrem só em leitura (`schemaVersion` maior que o suportado).
3. **Migração sem backup.** Ao abrir um projeto de versão antiga, `deserialize` migra em memória e o primeiro salvamento **sobrescreve o `mapping.json` original**. Um bug de migração destrói o arquivo de origem sem volta.

#### P1 — Correções e arquitetura

4. **Hook depois de `return` antecipado** em `src/app/Editor.tsx`: o `useEffect` de colar (linha ~213) vem depois de `if (!project) return null;` (linha ~161) e não tem lista de dependências (reinscreve o listener a cada renderização). O ESLint não pega isso porque **`eslint-plugin-react-hooks` não está configurado**.
5. **Estado derivado recalculado a cada quadro.** `CanvasController.render()` é um único `effect` que lê projeto, viewport, tamanho e UI. Qualquer pan/zoom (cada `pointermove`) recalcula também dados que só dependem do projeto: `projectIssues` (pendências do projeto inteiro), `layerDotsByMarking` (duas vezes), `markingVisibility`, `annotationsByMarking`, `childrenIndex`, `cardLabels`. O mesmo tipo de dado é calculado de novo pelo painel e pela lista. Não há agendamento por `requestAnimationFrame`: vários eventos no mesmo quadro geram várias renderizações completas.
6. **Buscas lineares nos caminhos quentes do modelo.** `issues.ts` e `refs.ts` usam `p.annotations.find(...)`, `p.layers.find(...)` dentro de laços sobre todas as anotações (O(n²)). Hoje custa pouco (0,26 ms com 750 anotações livres), mas cresce com anotações tipadas e referências, e roda a cada quadro (item 5).
7. **`CanvasController.ts` com 1.804 linhas** concentra renderização de imagens, marcações, cartão do zoom semântico, sobreposições (seleção, alças, rascunho, alvo de soltar), entrada de ponteiro/teclado e viewport. Difícil de revisar pelo celular e arriscado de alterar.
8. **`Editor.tsx` com 842 linhas e 22 hooks**, incluindo ~12 `useState` de diálogos independentes, lógica de importação/colar/arrastar e atalhos. `store`, `actions` e `ui` são repassados por props em vários níveis (sem contexto).
9. **Operações de pares chave-valor por índice** (`updateEntry`, `removeEntry`, `moveEntry`), embora as tuplas tenham `id` estável desde o schema v4. Índice é frágil diante de qualquer mudança concorrente na lista (ex: desfazer com um campo em edição).
10. **Memória cresce durante a sessão (celular):**
    - `session.ts` guarda em `trash` o `Blob` de toda imagem removida, para o desfazer, e **nunca libera**, mesmo depois que nenhum snapshot do histórico (limite de 100) referencia mais o arquivo;
    - `displayImages.ts` mantém o `ImageBitmap` de arquivos que saíram do projeto (ex: após trocar uma imagem) até fechar o projeto.
11. **Erros engolidos.** Há 31 `catch {}` sem registro. Vários são intencionais (detecção de recurso), mas em armazenamento e importação a falha some sem rastro, o que dificulta diagnosticar problemas relatados pelo celular. `writeFile` em `storage/folder.ts` não chama `abort()` no gravável quando a escrita falha.

#### P2 — Testes

12. **Nenhum teste de componente nem ponta a ponta.** Os 750 testes cobrem modelo, store, storage e funções puras do canvas, mas nenhum componente Preact é renderizado em teste, e nenhum fluxo é exercitado no `index.html` final. As fases 15 e 16 adicionaram muita interface (editores tipados, seletor de referência, backlinks) sem rede de proteção para refatorar.
13. **O teste de desempenho não mede o que roda por quadro.** O orçamento é de 500 ms, com um projeto sem anotações tipadas nem referências.

#### P3 — Documentação e organização

14. **`PLAN.md` com mais de 1.000 linhas e camadas de "a seção X prevalece".** Para um agente, o estado atual do produto está espalhado entre as seções 4, 7, 12 e 13. Não há `README.md` nem um documento de arquitetura.
15. **Ajuda duplicada:** o conteúdo de "Ajuda → Especializações" vive em `src/i18n/specHelp.ts` (495 linhas, dois idiomas) e também em `docs/SPEC-FORMAT.md`, sem garantia de que continuem iguais.
16. **`src/theme/global.css` com 1.544 linhas** num único arquivo, sem relação clara com os componentes.

### 14.3 Propostas

**CI de PR (1)**
- Novo workflow `ci.yml` em `pull_request` (e push em branches): `npm ci` → `npm run lint` → `npm run typecheck` → `npm test` → `npm run build`.
- O `deploy.yml` passa a rodar também o lint.

**Preview isolado (2)**
- O `workflow_dispatch` com um branch publica **a `main` em `/` e o branch em `/preview/`** no mesmo artefato do Pages. A produção nunca é substituída. Um push na `main` publica só a `main`.
- O build do preview recebe `VITE_CHANNEL=preview`, que:
  - acrescenta o sufixo `-preview` ao nome do banco IndexedDB e o prefixo `preview:` às chaves do `localStorage`;
  - mostra uma faixa fixa "PREVIEW — dados separados da versão principal";
  - usa o nome "Mapeador (preview)" no manifest.
- O service worker do preview fica no escopo de `/preview/` (registro relativo).

**Backup de migração (3)**
- Ao abrir um projeto cuja versão de schema seja menor que a atual, **antes do primeiro salvamento**, gravar uma cópia do texto original:
  - Pasta: `backups/mapping.v<versão>.<AAAAMMDD-HHMMSS>.json`;
  - Local (IndexedDB): registro de backup por projeto (manter os 3 mais recentes);
  - Zip importado: o backup vai para o armazenamento local do projeto criado.
- O zip exportado **não** inclui a pasta `backups/`.
- Aviso discreto: "Projeto atualizado do formato vN; uma cópia do original foi guardada."

**Hooks (4)**
- Adicionar `eslint-plugin-react-hooks` (regras `rules-of-hooks` como erro e `exhaustive-deps` como aviso), corrigir o `Editor.tsx` e todos os avisos que aparecerem.

**Índice do projeto (6)**
- `src/model/index` ganha `projectIndex(p)`, memoizado com `WeakMap<Project, ProjectIndex>` (funciona em Node): mapas por id de camadas, imagens, marcações, anotações e tuplas; filhos por marcação; anotações por marcação e por dono; backlinks.
- `issues.ts`, `refs.ts`, `display.ts`, `hierarchy.ts` e `listing.ts` usam o índice em vez de `find`/`filter` dentro de laços.

**Estado derivado e renderização (5)**
- Novo `src/store/derived.ts`: `computed` por editor para camadas visíveis, camada ativa efetiva, indicadores, visibilidade das marcações, pendências e rótulos. Canvas, painel e lista leem desses `computed`, não recalculam.
- No canvas, separar o que depende do **projeto/UI** do que depende do **viewport**. Pan/zoom só atualiza a transformação do stage e o que depende de escala (texto do zoom semântico, espessuras).
- Renderização agendada por `requestAnimationFrame`: o `effect` só marca "sujo"; uma renderização por quadro.

**Divisão do CanvasController (7)**
- `src/canvas/` em módulos com responsabilidade única, mantendo o `CanvasController` como orquestrador fino (< 300 linhas):
  - `renderers/images.ts`, `renderers/markings.ts`, `renderers/semanticCard.ts`, `renderers/overlay.ts` (seleção, alças, rascunho, alvo de soltar);
  - `input/pointer.ts` (eventos → `gestureMachine` → intenções) e `input/keyboard.ts`;
  - `viewportController.ts` (pan, zoom, enquadrar, centralizar).
- Cada renderer recebe dados prontos (do `derived.ts`) e só sabe atualizar nós do Konva.

**Divisão do Editor (8)**
- `EditorContext` (contexto Preact) com `session`, `store`, `actions`, `ui`, `derived` e o `CanvasController` atual. Componentes filhos deixam de receber esses objetos por props.
- `useEditorDialogs`: **um** estado com união discriminada (`{ kind: 'deleteImage', image } | { kind: 'aspect', ... } | ...`) no lugar dos ~12 `useState` de diálogo.
- `useImageIntake` (adicionar, colar, arrastar, trocar), `useEditorShortcuts`.
- Componentes `EditorTopBar`, `EditorBottomBar`, `EditorDialogs`. Meta: `Editor.tsx` < 250 linhas.

**Tuplas por id (9)**
- `updateEntry`, `removeEntry` e `moveEntry` recebem `entryId` (modelo, actions e UI). Remover as variantes por índice.

**Memória (10)**
- `session.ts`: depois de cada salvamento, descartar de `trash` os arquivos que não aparecem em nenhum snapshot de `past`/`future` nem no projeto atual (o store expõe os arquivos referenciados pelo histórico).
- `displayImages.ts`: `retain(paths)` libera (`close()`) os bitmaps de arquivos fora do conjunto; o editor chama com os arquivos do projeto atual. Um arquivo que volte pelo desfazer é recarregado sob demanda.

**Erros (11)**
- `src/utils/report.ts` com `reportError(contexto, erro)`: registra no console com contexto e guarda os últimos 20 erros em memória.
- Menu → "Diagnóstico": lista os últimos erros (contexto, mensagem, horário) com botão "Copiar", para colar numa conversa.
- Revisar os 31 `catch {}`: os de armazenamento, importação e salvamento passam a chamar `reportError`; os de detecção de recurso ficam como estão, com um comentário dizendo por quê.
- `storage/folder.ts`: `abort()` no gravável quando a escrita falhar.

**Testes (12, 13)**
- **Componentes**: `@testing-library/preact` no projeto `app` do Vitest. Cobrir: `AnnotationEditor` (livre e tipada), `TypedFields` (tabela e seletor de `ref`), `SpecsDialog` (aplicar, atualizar, remover), `LayersDialog`, `CommitInput`.
- **Ponta a ponta**: Playwright **só no CI** (o ambiente cloud do Claude Code pode não baixar navegadores). Testes contra o `dist/index.html` servido localmente, em duas configurações (desktop e celular com toque emulado):
  - criar projeto local, adicionar uma imagem de fixture, desenhar uma marcação, anotar, exportar o zip e conferir o `mapping.json`;
  - celular: pan sobre marcação selecionada não move; segurar e arrastar move;
  - aplicar o exemplo SDUI, criar um Input com `dado` apontando para uma tupla livre.
- **Desempenho por quadro**: novo fixture com 500 marcações, 1.500 anotações (metade tipadas) e 500 referências. Orçamentos (Node): `projectIndex` + pendências + indicadores + visibilidade < 8 ms; uma renderização do canvas com o projeto já indexado < 16 ms (jsdom, Konva com canvas falso, se viável; senão só a parte de dados derivados).
- Relatório de cobertura (`@vitest/coverage-v8`) no CI, sem limite mínimo por enquanto.

**Documentação (14, 15, 16)**
- `README.md`: o que é, como rodar, testar, publicar e usar o preview.
- `docs/ARCHITECTURE.md`: camadas (`model` → `store` → `storage` / `canvas` / `ui`), fluxo de dados (action → operação pura → snapshot → `derived` → canvas/UI → autosave), regras (as do CLAUDE.md, com o porquê) e onde fica cada coisa.
- `docs/FORMAT.md` passa a ser **a** referência do schema atual (v4), completa, sem depender do `PLAN.md`.
- `PLAN.md`: mover as seções concluídas (1 a 13) para `docs/history/PLAN-etapas-1-2.md`, sem alterar o conteúdo. O `PLAN.md` fica com: resumo do produto, links para README/ARCHITECTURE/FORMAT/SPEC-FORMAT e só as fases pendentes.
- Ajuda: um teste garante que cada seção de `specHelp.ts` (pt-BR) tem correspondente em `docs/SPEC-FORMAT.md` (mesmos títulos e mesmos blocos de código), para os dois não divergirem.
- CSS: dividir `global.css` em arquivos por área (`base.css`, `layout.css`, `dialogs.css`, `panels.css`, `canvas.css`, `forms.css`), importados por `main.tsx`. Sem mudar seletores nem visual.

### 14.4 Fases

#### Fase 18 — Segurança do fluxo (P0)
- [x] `ci.yml` em PR com lint, typecheck, testes e build; lint também no `deploy.yml`
- [x] Preview em `/preview/` com `VITE_CHANNEL=preview`: armazenamento separado, faixa de aviso, manifest próprio
- [x] Backup do `mapping.json` original antes do primeiro salvamento após migração (pasta e local) + aviso

**Aceite**: um PR com erro de lint fica vermelho; publicar um branch pelo `workflow_dispatch` mantém a versão principal intacta e o preview não enxerga os projetos locais dela; abrir o projeto de teste v1 (`tests/fixtures/mapping-v1.json`) numa pasta cria o backup e só então grava o v4.

#### Fase 19 — Correções pontuais
- [x] `eslint-plugin-react-hooks` + correção do `Editor.tsx` e dos avisos
- [x] Tuplas por id (`updateEntry`/`removeEntry`/`moveEntry`)
- [x] `abort()` em `writeFile` da pasta

**Aceite**: lint sem erros com a regra nova; testes das operações por id; comportamento igual no roteiro 13.9.

#### Fase 20 — Rede de testes
- [x] Testes de componentes (lista da 14.3)
- [x] Playwright no CI com os três fluxos (desktop e celular emulado)
- [x] Cobertura no CI

**Aceite**: CI verde com os novos testes; quebrar de propósito o seletor de `ref` faz um teste de componente falhar.

#### Fase 21 — Índice, estado derivado e renderização por quadro
- [x] `projectIndex` com `WeakMap` + uso em `issues`, `refs`, `display`, `hierarchy`, `listing`
- [x] `src/store/derived.ts` consumido por canvas, painel e lista
- [x] Canvas: separação projeto × viewport e renderização por `requestAnimationFrame`
- [x] Fixture grande com tipadas e referências + orçamentos de desempenho

**Aceite**: orçamentos da 14.3 cumpridos; pan e zoom no celular com o fixture grande sem travadas perceptíveis; todos os testes verdes.

#### Fase 22 — Divisão do CanvasController
- [x] Renderers, entrada e viewport em módulos (14.3); `CanvasController` < 300 linhas
- [x] Testes unitários dos renderers com Konva em jsdom (o que for viável) e dos módulos de entrada

**Aceite**: sem mudança de comportamento (testes, E2E e roteiro 13.9); nenhum arquivo de `src/canvas/` com mais de 400 linhas.

#### Fase 23 — Divisão do Editor
- [x] `EditorContext`, `useEditorDialogs`, `useImageIntake`, `useEditorShortcuts`
- [x] `EditorTopBar`, `EditorBottomBar`, `EditorDialogs`; `Editor.tsx` < 250 linhas

**Aceite**: sem mudança de comportamento; componentes filhos sem `store`/`actions`/`ui` em props.

#### Fase 24 — Memória e diagnóstico de erros
- [x] Limpeza do `trash` pelo histórico; `retain` dos bitmaps
- [x] `reportError`, revisão dos `catch {}` e tela "Diagnóstico"

**Aceite**: testes provando que o `trash` e os bitmaps são liberados quando nenhum snapshot referencia o arquivo e restaurados pelo desfazer quando ainda referenciam; um erro forçado de gravação aparece em "Diagnóstico".

#### Fase 25 — Documentação e organização
- [ ] `README.md`, `docs/ARCHITECTURE.md`, `docs/FORMAT.md` completo
- [ ] `PLAN.md` enxuto + histórico em `docs/history/`
- [ ] Teste de consistência entre a ajuda e o `SPEC-FORMAT.md`
- [ ] `global.css` dividido por área

**Aceite**: um agente sem acesso ao histórico consegue entender o schema atual só pelo `docs/FORMAT.md`; o visual da app não muda.

> **Dependências**: 18 e 19 independentes. 20 depois da 19 (o lint novo). 21 depois da 20. 22 e 23 depois da 21. 24 depois da 21. 25 por último (documenta a arquitetura final).
