# Design system

O design system (DS) do Mapping é o artefato **Mapping** do Claude Design:

<https://claude.ai/artifact/HEoYNh91CqK1YDDpjXBxi9>

Este arquivo é o registro dele no repositório. Ele diz o que o DS é, **quando** uma fase precisa olhar para o DS, **quando** o DS é atualizado, qual parte do DS corresponde a qual parte do código, o que está pendente e o que já foi sincronizado. É o arquivo que o job `epic` do `ci.yml` exige no PR de todo épico.

## O que o DS é, e o que ele não é

- **É curado à mão.** Cada componente tem um guia (`README.md`) e um preview em HTML escritos por pessoas, com os estados desenhados um por um. O conteúdo tem autores: ao atualizar, mexa só no que a entrega mudou.
- **Não é gerado do código.** A skill `/design-sync` do Claude Code **não se aplica** a este DS: ela espera o `dist/` de uma biblioteca de componentes publicada e transformaria o DS curado num espelho do build. Não a use aqui.
- **O código é a fonte da verdade; o DS descreve.** Onde os dois divergirem, corrija o DS. Divergência que pareça defeito da app não se resolve aqui: registre em "Pendências" e leve ao dono.
- **Nome.** O índice do artefato se chama **Mapping**. Os documentos de `docs/redesign/` o chamam de "Mapeador de Imagens 2.0", nome da etapa 2.3; é o mesmo artefato.
- **Tamanho hoje:** 63 componentes com guia e preview (mais a capa `Cover`), 6 seções, 145 tokens e 85 ícones.

## Quando verificar

Se o "Toca em:" da fase cruzar qualquer caminho abaixo, a fase precisa olhar o DS. É leitura do mapa: não exige abrir o artefato.

| Mudou no código                                                                                | Olhe no DS                                                                                      |
| ---------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| `src/ui/controls/**`                                                                           | `Button`, `IconButton`, `TextField`, `Select`, `Choice`, `Segmented`, `Tabs`, `Tooltip`, `Tags` |
| `src/ui/**` (fora de `controls/` e `review/`)                                                  | o componente correspondente no mapa: painéis, janelas, diálogos e barras                        |
| `src/ui/review/**`                                                                             | os componentes de revisão e a seção `Revisao.md`                                                |
| `src/ui/catalog/**`                                                                            | `CatalogPage`, `CatalogScreen`, `CatalogWindow`                                                 |
| `src/app/Home.tsx`, `NarrowWindow.tsx`, `CatalogScreen.tsx`, `Editor*.tsx`, `*Dialog*.tsx`     | `Home`, `NarrowWindow`, `ConfirmDialogs`, `ToolWindow` e a seção `Layouts.md`                   |
| `src/canvas/renderers/**`, `src/canvas/components/**`, `theme.ts`, `viewport.ts`, `minimap.ts` | `Arrow`, `CanvasMarking`, `Container`, `ComponentDrawing`, `Minimap` e a seção `Canvas.md`      |
| `src/theme/tokens.ts`                                                                          | `tokens.json` e a seção `Contraste.md`                                                          |
| `src/ui/icons.tsx`                                                                             | o grupo de ícones `Icons`                                                                       |
| `src/app/shortcuts.ts`, `src/app/useEditorShortcuts.ts`, `src/ui/shortcutList.ts`              | a seção `Atalhos.md`                                                                            |
| `src/i18n/**`                                                                                  | só quando muda um rótulo que aparece num preview ou num guia                                    |

A lista é um filtro rápido, não um limite: uma mudança em `src/model/` ou `src/store/` que altere **o que a pessoa vê na tela** também conta — foi o caso de `src/store/proposedCatalog.ts` (visão Proposto) e de `src/store/imagePermissions.ts` (Privacidade).

**Nunca dispara:** testes, `examples/`, `libraries/`, `lab/`, `mcp/`, `scripts/` e documentação.

## Como verificar, fase a fase

1. Cruze o "Toca em:" da fase com a tabela acima e com o mapa.
2. Declare o resultado no item **Impacto no DS** da descrição do PR: `nenhum`, ou o que a mudança afeta.
3. Se não for `nenhum`, acrescente a pendência na seção "Pendências" deste arquivo, no mesmo PR, com o que mudou e os arquivos que provam.

Nenhuma fase grava no artefato do DS.

## Quando atualizar

O **fechamento de todo épico** aplica as pendências no artefato, esvazia a lista e acrescenta uma entrada ao "Histórico de sincronização". É a única hora em que se grava no DS, por dois motivos: pessoas editam o DS ao vivo, e o índice (`project/design-system.json`) precisa ser lido imediatamente antes de cada gravação — uma gravação por épico evita conflito e idas e vindas.

Ao gravar:

- **O índice vai por último**, numa chamada só, lido imediatamente antes, com `lastChange` preenchido (`by`, `at`, `via`, `note`).
- **Nenhum arquivo do DS é apagado** sem o dono pedir.
- Confira o contraste nos temas claro e escuro em tudo o que tocar.
- As instruções completas do formato estão no próprio artefato (`SKILL.md` e `artifact-type/reference/`), e devem ser lidas antes de gravar.

## Mapa

Cada componente do DS e a origem dele no código. Um nome do DS pode cobrir vários arquivos, e alguns correspondem a uma função local, não a um componente exportado — a coluna "Observação" diz quando é o caso. Componente desenhado no canvas não tem `.tsx`: a origem é o renderer e a geometria.

### Componentes: controles e moldura da app

| Componente        | Origem no código                                                                                                                  | Observação                                                                                        |
| ----------------- | --------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| `Button`          | `src/ui/controls/Button.tsx`                                                                                                      | Inclui o `LinkButton`.                                                                            |
| `IconButton`      | `src/ui/controls/IconButton.tsx`                                                                                                  | Inclui o `IconLink`; usa `Tooltip`.                                                               |
| `TextField`       | `src/ui/controls/TextField.tsx`, `src/ui/CommitInput.tsx`                                                                         | Inclui o `TextArea`; o `CommitInput` dá o `onCommit`.                                             |
| `Select`          | `src/ui/controls/Select.tsx`                                                                                                      |                                                                                                   |
| `Choice`          | `src/ui/controls/Choice.tsx`                                                                                                      | Caixa e rádio.                                                                                    |
| `Segmented`       | `src/ui/controls/Segmented.tsx`                                                                                                   |                                                                                                   |
| `Tabs`            | `src/ui/controls/Tabs.tsx`, `src/ui/BottomTabs.tsx`                                                                               | `BottomTabs` é o uso na janela inferior.                                                          |
| `Tooltip`         | `src/ui/controls/Tooltip.tsx`                                                                                                     |                                                                                                   |
| `Menu`            | `src/ui/MenuPopover.tsx`, `src/ui/ActionMenu.tsx`, `src/ui/CanvasContextMenu.tsx`, `src/ui/CopyActions.tsx`, `src/ui/Popover.tsx` | Três menus num guia só; `Popover` é a base de posicionamento.                                     |
| `Dialog`          | `src/ui/Dialog.tsx`                                                                                                               |                                                                                                   |
| `ConfirmDialogs`  | `src/app/EditorDialogs.tsx`, `src/app/useEditorDialogs.ts`                                                                        | `ConfirmDialog` e `ExternalChangeDialog` moram no `EditorDialogs.tsx`.                            |
| `Banner`          | `src/ui/Banner.tsx`, `src/ui/PreviewBanner.tsx`, `src/ui/UpdateBanner.tsx`                                                        |                                                                                                   |
| `Notice`          | `src/ui/Notice.tsx`                                                                                                               | O `.notice` de parágrafo também está em `src/ui/InstallHint.tsx`.                                 |
| `Tags`            | `src/ui/controls/Chip.tsx`                                                                                                        | Chip da camada ativa em `src/app/EditorMainBar.tsx`; etiqueta de camada em `src/ui/ListView.tsx`. |
| `Breadcrumbs`     | `src/ui/Breadcrumbs.tsx`                                                                                                          | Controles à direita da barra em `src/app/EditorTools.tsx` e `src/ui/ZoomField.tsx`.               |
| `StatusBar`       | `src/ui/StatusBar.tsx`                                                                                                            |                                                                                                   |
| `ToolWindow`      | `src/ui/ToolWindow.tsx`                                                                                                           | Tamanhos em `src/ui/toolWindowLayout.ts`; montagem em `src/app/EditorWindows.tsx`.                |
| `ToolStripButton` | `src/ui/ToolStrip.tsx`                                                                                                            | É o `StripButton`, não exportado; metadados em `src/ui/toolWindowMeta.ts`.                        |
| `NarrowWindow`    | `src/app/NarrowWindow.tsx`                                                                                                        | Exporta `NarrowWindowNotice` e `useNarrowWindow`; limite em `src/theme/breakpoints.ts`.           |
| `Home`            | `src/app/Home.tsx`                                                                                                                | Linhas dos recentes em `src/app/recentRows.ts`.                                                   |
| `HelpDialog`      | `src/ui/HelpDialog.tsx`                                                                                                           | Atalhos de `src/ui/shortcutList.ts`.                                                              |
| `Cover`           | —                                                                                                                                 | Capa do DS; não tem guia nem equivalente no código.                                               |

### Componentes: canvas, marcações e painéis de detalhes

| Componente                  | Origem no código                                                                                                                                                    | Observação                                                                                                                                     |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `Arrow`                     | `src/canvas/renderers/arrows.ts`, `src/canvas/arrowGeometry.ts`, `src/canvas/renderers/overlay.ts`                                                                  | Desenhada no Konva; sem `.tsx`.                                                                                                                |
| `ArrowPanel`                | `src/ui/ArrowPanel.tsx`                                                                                                                                             |                                                                                                                                                |
| `CanvasMarking`             | `src/canvas/renderers/markings.ts`, `src/canvas/renderers/overlay.ts`, `src/canvas/renderers/lockBadge.ts`, `src/canvas/renderers/review.ts`, `src/canvas/theme.ts` | Especificação do desenho no Konva, não componente Preact; geometria em `src/canvas/markingGeometry.ts`.                                        |
| `Container`                 | `src/canvas/renderers/images.ts`, `src/canvas/renderers/overlay.ts`, `src/canvas/renderers/review.ts`                                                               | Desenhado no Konva; sem `.tsx`.                                                                                                                |
| `ContainerDialog`           | `src/ui/ContainerDialog.tsx`, `src/ui/containerForm.ts`                                                                                                             |                                                                                                                                                |
| `ComponentDrawing`          | `src/canvas/components/componentLayer.ts`, `src/canvas/components/renderScene.ts`, `src/canvas/components/screenRenderer.ts`                                        | Desenhado no Konva; nó `image` via `imageLoader.ts` e `remoteImages.ts`.                                                                       |
| `Minimap`                   | `src/ui/Minimap.tsx`, `src/canvas/minimap.ts`                                                                                                                       | DOM, não Konva; contas de layout no canvas.                                                                                                    |
| `ZoomField`                 | `src/ui/ZoomField.tsx`                                                                                                                                              | Usado em `src/ui/StatusBar.tsx` e `src/ui/Breadcrumbs.tsx`.                                                                                    |
| `MarkingPanel`              | `src/ui/MarkingPanel.tsx`                                                                                                                                           |                                                                                                                                                |
| `MarkingPicker`             | `src/ui/MarkingPicker.tsx`                                                                                                                                          |                                                                                                                                                |
| `MultiSelectionPanel`       | `src/ui/MultiSelectionPanel.tsx`                                                                                                                                    |                                                                                                                                                |
| `LayerGroup`                | `src/ui/AnnotationsPanel.tsx`, `src/ui/LayersPanel.tsx`                                                                                                             | `LayerGroup` é função interna do `AnnotationsPanel.tsx`; o guia cobre também a lista de camadas (`LayersPanel`, janela em `LayersWindow.tsx`). |
| `TreeRow`                   | `src/ui/MarkingTree.tsx`                                                                                                                                            | Linha da Árvore; janela em `src/ui/TreeWindow.tsx`.                                                                                            |
| `KeyValueGrid`              | `src/ui/KeyValueGrid.tsx`                                                                                                                                           |                                                                                                                                                |
| `PropertyGrid`              | `src/ui/PropertyGrid.tsx`                                                                                                                                           |                                                                                                                                                |
| `DataGrid`                  | `src/ui/TableField.tsx`, `src/ui/ListView.tsx`                                                                                                                      | Dois usos sob um nome: campo `table` dos Detalhes e Lista em tabela.                                                                           |
| `RefCell`                   | `src/ui/RefCell.tsx`, `src/ui/RefPicker.tsx`                                                                                                                        | Seletor em modo `compact`.                                                                                                                     |
| `ReferenceField`            | `src/ui/TypedFields.tsx`, `src/ui/RefPicker.tsx`                                                                                                                    | `RefField` é função interna do `TypedFields.tsx`.                                                                                              |
| `InconsistentProjectDialog` | `src/ui/InconsistentProjectDialog.tsx`                                                                                                                              | Aberto por `src/app/Home.tsx`.                                                                                                                 |

### Componentes: revisão, propostas, catálogo e configurações

| Componente         | Origem no código                    | Observação                                                                                  |
| ------------------ | ----------------------------------- | ------------------------------------------------------------------------------------------- |
| `ChangeBelow`      | `src/ui/review/ChangeBelow.tsx`     |                                                                                             |
| `ChangeKind`       | `src/ui/review/ChangeKind.tsx`      |                                                                                             |
| `ChangeMark`       | `src/ui/review/ChangeMark.tsx`      |                                                                                             |
| `ChangePopover`    | `src/ui/review/ChangePopover.tsx`   |                                                                                             |
| `DecisionControl`  | `src/ui/review/DecisionControl.tsx` | Também exporta `REVIEW_KEYS` (atalhos A, R, Backspace).                                     |
| `DecisionMark`     | `src/ui/review/DecisionMark.tsx`    |                                                                                             |
| `DiffValue`        | `src/ui/review/DiffValue.tsx`       |                                                                                             |
| `Flag`             | `src/ui/review/Flag.tsx`            |                                                                                             |
| `ImageCompare`     | `src/ui/review/ImageCompare.tsx`    | Aberto por `CompareDialog` em `src/ui/review/ReviewCanvasControls.tsx`.                     |
| `NoteField`        | `src/ui/review/NoteField.tsx`       |                                                                                             |
| `OtherChanges`     | `src/ui/review/OtherChanges.tsx`    | Exporta `OtherChangesSection`, `OtherChangeRow` e `ImagesSection`.                          |
| `ProposalRow`      | `src/ui/review/ProposalRow.tsx`     | Usada em `ProposalList.tsx`; também exporta `DecisionCounts`.                               |
| `ReviewBar`        | `src/ui/review/ReviewBar.tsx`       |                                                                                             |
| `ReviewHeader`     | `src/ui/review/ReviewHeader.tsx`    | Exporta também `IdentityFlags`.                                                             |
| `ReviewRow`        | `src/ui/review/ReviewRow.tsx`       | Usada em `ReviewLevels.tsx`.                                                                |
| `UpdateImpact`     | `src/ui/UpdateImpact.tsx`           |                                                                                             |
| `CatalogPage`      | `src/ui/catalog/CatalogPage.tsx`    | Também `CatalogView.tsx`, `Playground.tsx`, `renderer.ts` e `src/ui/markdown/Markdown.tsx`. |
| `CatalogScreen`    | `src/app/CatalogScreen.tsx`         | Usa `src/store/libraryPreview.ts`.                                                          |
| `CatalogWindow`    | `src/ui/CatalogWindow.tsx`          | Também `LibraryPalette.tsx` e `useAddComponent.ts`.                                         |
| `CodeDefinitions`  | `src/ui/CodeDefinitions.tsx`        | Resolve a variante por `typeCodeDefinitions` (`src/model/codeVariants.ts`).                 |
| `SpecsDialog`      | `src/ui/SpecsDialog.tsx`            | Também `specPackageImport.ts`.                                                              |
| `LibraryIssueList` | `src/ui/LibraryIssueList.tsx`       |                                                                                             |
| `SettingsDialog`   | `src/ui/SettingsDialog.tsx`         | Também `SettingsBar.tsx`, `PlatformRepos.tsx` e `PrivacySettings.tsx`.                      |

### Seções

| Seção          | Origem                                                                                                                                               | Estado                                                                                |
| -------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| `README.md`    | o livro da marca; sem origem única no código                                                                                                         | Autoral.                                                                              |
| `Atalhos.md`   | `src/app/shortcuts.ts`, `src/app/useEditorShortcuts.ts`, `src/ui/shortcutList.ts`, `src/ui/review/DecisionControl.tsx`, `src/store/toolWindows.ts`   | Em dia.                                                                               |
| `Canvas.md`    | `src/canvas/theme.ts`, `src/canvas/renderers/`, `src/canvas/reviewMarks.ts`, `src/canvas/viewport.ts`, `src/canvas/input/`, `src/canvas/components/` | Falta a nota do fantasma da criação rejeitada nas duas visões e do componente criado. |
| `Conceitos.md` | `docs/FORMAT.md` (schema v13), `src/model/` (`hierarchySettle.ts`, `arrows.ts`, `locks.ts`, `componentDrawings.ts`), `docs/PROPOSAL-FORMAT.md`       | Em dia.                                                                               |
| `Contraste.md` | `src/theme/tokens.ts`, `tests/theme/` (`contrast`, `tokens`, `tokenLiterals`, `canvasLiterals`)                                                      | Valores em dia; as razões não foram recalculadas.                                     |
| `Layouts.md`   | `src/app/Editor*.tsx`, `src/app/Home.tsx`, `src/app/NarrowWindow.tsx`, `src/ui/toolWindowLayout.ts`, `src/ui/ToolWindow.tsx`, `src/theme/`           | Em dia nas medidas.                                                                   |
| `Revisao.md`   | `src/ui/review/`, `src/canvas/reviewMarks.ts`, `src/canvas/renderers/review.ts`, `src/store/proposedCatalog.ts`, `src/store/review.ts`               | **Desatualizada** (ver Pendências).                                                   |

### Tokens

Fonte única: `src/theme/tokens.ts` (tema claro e escuro). O canvas lê os tokens por `src/canvas/theme.ts`. O DS guarda a mesma lista em `project/tokens.json`.

Conferido em 2026-11-02 por nome e por valor, nos dois temas: **145 tokens no DS, 146 no código, 145 batem**. Nenhum token do DS falta no código, e nenhum valor divergiu. Sete tokens de cor só diferem na notação do alias (`{x}` no DS, `var(--x)` no código) e resolvem para o mesmo valor.

| Família                            | No DS | No código      |
| ---------------------------------- | ----- | -------------- |
| `color` (inclui `cv-*`, `layer-*`) | 57    | 57             |
| `type` (estilos `t-*`)             | 12    | 12 (+ 5 alias) |
| `spacing`                          | 8     | 8              |
| `radius`                           | 6     | 6              |
| `shadow`                           | 1     | 1              |
| `size`                             | 37    | 38             |
| `opacity`                          | 8     | 8              |
| `duration`                         | 6     | 6              |
| `zIndex`                           | 8     | 8              |
| `breakpoint`                       | 2     | 2              |

Falta no DS: `size-grid-col-min` (`96px`) e os 11 papéis `control-height`, `control-height-sm`, `control-radius`, `control-icon`, `control-check`, `row-height`, `t-text`, `t-text-small`, `t-text-heading`, `t-text-title` e `t-text-input`. Os papéis importam porque o `CLAUDE.md` manda o CSS usar só os `--control-*`, não os tokens crus.

### Ícones

Fonte única: `src/ui/icons.tsx` (SVG inline, grade de 16 px, traço de 1,25, `currentColor`). O DS guarda cada ícone como um upload no grupo `Icons`.

Conferido em 2026-11-02: **85 ícones no DS, 85 em `icons.tsx`, correspondência 1:1**, sem sobra de nenhum lado. A única diferença é a convenção de nome — o DS usa o nome do arquivo em kebab-case (`zoom-in.svg`), o código usa a chave em camelCase (`zoomIn`). Ao acrescentar um ícone, mantenha os dois nomes correspondentes.

## Com forma visível e sem componente no DS

Levantado em 2026-11-02. Estes arquivos aparecem na tela e nenhum guia do DS os cobre. **Não são pendência:** entrar ou não no DS é decisão do dono, e criar componente novo está fora do escopo da etapa de sincronia.

- Diálogos: `src/ui/review/ExitReviewDialog.tsx`, `src/app/ExportDialog.tsx`, `src/ui/SpecsDialog.tsx`, `src/ui/InconsistentProjectDialog.tsx` (os três últimos só citados no guia de `Dialog`).
- Barras e faixas: `src/app/EditorMainBar.tsx`, `src/app/EditorTools.tsx`, `src/ui/SettingsBar.tsx`, `src/ui/ImageConsentBanner.tsx`, `src/ui/InstallHint.tsx`, `src/ui/review/ProposalNotices.tsx`.
- Revisão: `src/ui/review/ReviewLevels.tsx` (a barra de progresso e os filtros), `src/ui/review/ProposalList.tsx` (a busca e o estado vazio), `src/ui/review/ReviewCanvasControls.tsx` (o alternador Atual/Proposto e a legenda das marcas).
- Detalhes e campos: `src/ui/FieldEditors.tsx`, `src/ui/CommitInput.tsx`, `src/ui/AnnotationEditor.tsx`, `src/ui/AnnotationSummary.tsx`, `src/ui/DetailsSection.tsx`, `src/ui/DetailsIdentity.tsx`, `src/ui/MarkingColorField.tsx`.
- Configurações: `src/ui/PrivacySettings.tsx`, `src/ui/PlatformRepos.tsx`.
- Outros: `src/ui/Popover.tsx`, `src/ui/LibraryPalette.tsx`, `src/ui/DiagnosticsView.tsx`, `src/ui/IncompleteView.tsx`, `src/ui/LayersWindow.tsx`, `src/ui/TreeWindow.tsx`.

Composições e lógica sem forma própria (não precisam de componente): `src/ui/SelectionPanel.tsx`, `src/ui/review/ReviewPanel.tsx`, `ReviewDetails.tsx`, `ProposalsWindow.tsx`, `reviewExtension.tsx`, `changeText.ts`, `levelRows.ts`, `src/canvas/reviewMarks.ts`, `src/store/proposedCatalog.ts`, `src/canvas/frame.ts`, `containment.ts`, `gestureMachine.ts`, `input/`, `viewportController.ts`.

## Pendências

O que o código já tem e o DS ainda não descreve. O fechamento do épico aplica isto no artefato e esvazia a lista.

### Proposto com componentes (etapa concluída em 2026-10-24)

A visão Proposto da revisão desenha os componentes que a proposta cria, com a marca de criada, e a criação rejeitada virou fantasma pontilhado nas **duas** visões (`src/store/proposedCatalog.ts`, `src/canvas/reviewMarks.ts`).

- Seção `Revisao.md`: a subseção "Componentes novos na visão Proposto" ainda diz "Aprovado em 24/10/2026, ainda não implementado", e a lista "Para implementar" e a menção a `review.legend.rejected` "(só em Atual)" já se cumpriram — a string não existe mais em `src/`.
- Seção `Canvas.md`: falta a nota do fantasma nas duas visões e do componente criado desenhado no Proposto.
- `ComponentDrawing`: o guia repete o "ainda não está implementado".
- `ChangeMark`, `ChangePopover`, `ReviewBar`, `ReviewHeader`, `OtherChanges`: nenhum diz que a visão Proposto desenha os componentes criados.

### Sugestões no campo de texto (etapa concluída em 2026-10-29)

Um campo ou coluna `string` da especialização oferece vocabulário sugerido ao digitar (`suggestions`, que não restringe o valor) e, com `linkedRef`, as declarações que um `ref` irmão aceita, gravando texto e `ref` juntos numa entrada do desfazer (`src/ui/suggestions.ts`, `src/ui/CommitInput.tsx`, `src/ui/linkedRef.ts`, `src/ui/FieldEditors.tsx`).

- `TextField`, `PropertyGrid`, `KeyValueGrid`, `DataGrid`, `ReferenceField`: nenhum guia cita o vocabulário sugerido.

### Imagens remotas (etapa concluída em 2026-10-31)

Um componente mostra imagem de uma URL `https:` no canvas (nó `image`, `src` ligado a campo `string`), com política de URL, consentimento por origem e interruptores de Privacidade.

- `ComponentDrawing`: o guia descreve só o reservado de imagem e o `slot`, sem o nó `image`, o consentimento e o reservado enquanto a origem não é liberada (`src/canvas/components/renderScene.ts`, `imageLoader.ts`, `remoteImages.ts`).
- `SettingsDialog`: o guia não tem a seção Privacidade (origens permitidas com Revogar e os quatro interruptores de risco, desligados por padrão: qualquer origem, `http`, rede local, servidor sem CORS; `src/ui/PrivacySettings.tsx`, `src/store/imagePermissions.ts`).

### Biblioteca Material 3 (etapa concluída em 2026-11-01)

O `code` de uma plataforma ganhou `variants`: um campo `enum` do tipo escolhe a variante, que troca o símbolo, o arquivo e as notas (`src/model/codeVariants.ts`, `resolveCode`).

- `CodeDefinitions`: o guia não lista a prop `values` nem diz que a linha mostra o arquivo e o símbolo da variante escolhida.
- `CatalogPage`: o guia não cita a tabela de variantes (`VariantsTable`, abaixo do `code` da plataforma, com legenda).

### Marcação pai (épico aberto, `epic/marcacao-pai`)

- `MultiSelectionPanel`: falta o botão **Envolver**, que cria uma marcação pai em volta da seleção, com a dica quando desabilitado (`src/model/multiSelection.ts`, `src/ui/MultiSelectionPanel.tsx`).
- `TreeRow`, `LayerGroup`: falta a dica (`title`) nos nomes cortados com reticências.

### Tokens

- Os 11 papéis `control-*`, `row-height` e `t-text*`, mais `size-grid-col-min`, não estão em `tokens.json`.

### A conferir

- `ReviewHeader`: o guia descreve "Aceitar remoção" e "+ N anotações criadas"; o comportamento não foi confirmado linha a linha contra `ReviewHeader.tsx`.
- `Contraste.md`: as razões de contraste não foram recalculadas, só os valores dos tokens.
- `Notice`: o guia diz que `.notice-error` e `.notice-success` não têm uso na app; não conferido no CSS.

## Histórico de sincronização

Uma entrada por épico que gravou no DS: data do merge, épico, e o que mudou.

| Data | Épico | O que mudou no DS                                                                                                                                   |
| ---- | ----- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| —    | —     | Nenhuma sincronização registrada desde a criação deste arquivo. A última alteração do artefato antes dele é de 2026-10-24 (`lastChange` do índice). |
