# Design system

O design system (DS) do Mapping é o artefato **Mapping** do Claude Design:

<https://claude.ai/artifact/HEoYNh91CqK1YDDpjXBxi9>

Este arquivo é o registro dele no repositório. Ele diz o que o DS é, **quando** uma fase precisa olhar para o DS, **quando** o DS é atualizado, qual parte do DS corresponde a qual parte do código e as pendências que não são de um épico. O que cada épico pediu e o que o fechamento gravou fica num arquivo por épico em [`docs/design-system/`](design-system/), que o job `epic` do `ci.yml` exige no PR de todo épico.

## O que o DS é, e o que ele não é

- **É curado à mão.** Cada componente tem um guia (`README.md`) e um preview em HTML escritos por pessoas, com os estados desenhados um por um. O conteúdo tem autores: ao atualizar, mexa só no que a entrega mudou. Isso não impede o fechamento de gravar: quer dizer mexer só no que a entrega mudou, sem `/design-sync`.
- **Não é gerado do código.** A skill `/design-sync` do Claude Code **não se aplica** a este DS: ela espera o `dist/` de uma biblioteca de componentes publicada e transformaria o DS curado num espelho do build. Não a use aqui.
- **O código é a fonte da verdade; o DS descreve.** Onde os dois divergirem, corrija o DS. Divergência que pareça defeito da app não se resolve aqui: registre em "Pendências" e leve ao dono.
- **Nome.** O índice do artefato se chama **Mapping**. Se aparecer o nome antigo "Mapeador de Imagens 2.0", é o mesmo artefato.
- **Tamanho hoje:** 79 componentes com guia (mais a capa `Cover`), 6 seções, 177 tokens (fora os 12 estilos de texto `t-*`) e 92 ícones (artefato na versão 71, DS5 do épico `sincronia-ds-2`).

## Quando verificar

Se o "Toca em:" da fase (na sub-issue da fase, no GitHub) cruzar qualquer caminho abaixo, a fase precisa olhar o DS. É leitura do mapa: não exige abrir o artefato.

| Mudou no código | Olhe no DS |
| --- | --- |
| `src/ui/controls/**` | `Button`, `IconButton`, `TextField`, `Select`, `Choice`, `Segmented`, `Tabs`, `Tooltip`, `HelpTip`, `Tags` |
| `src/ui/**` (fora de `controls/`, `review/` e `comments/`) | o componente correspondente no mapa: painéis, janelas, diálogos e barras |
| `src/ui/review/**` | os componentes de revisão e a seção `Revisao.md` |
| `src/ui/comments/**`, `src/canvas/commentPins.ts`, `src/canvas/renderers/commentPins.ts`, `src/theme/threads.css` | os componentes de comentários (`CommentPin`, `CitationChip`, `ThreadMessage`, `ThreadsSection`, `Composer`, `CommentsWindow`, `ProposalCard`, `DeleteThreadDialogs`) e a seção `Canvas.md` (pino) |
| `src/ui/catalog/**` | `CatalogPage`, `CatalogScreen`, `CatalogWindow` |
| `src/app/Home.tsx`, `NarrowWindow.tsx`, `CatalogScreen.tsx`, `Editor*.tsx`, `*Dialog*.tsx` | `Home`, `NarrowWindow`, `ConfirmDialogs`, `ToolWindow` e a seção `Layouts.md` |
| `src/canvas/renderers/**`, `src/canvas/components/**`, `theme.ts`, `viewport.ts`, `minimap.ts` | `Arrow`, `CanvasMarking`, `Container`, `ComponentDrawing`, `Minimap` e a seção `Canvas.md` |
| `src/theme/tokens.ts` | `tokens.json` e a seção `Contraste.md` |
| `src/ui/icons.tsx` | o grupo de ícones `Icons` |
| `src/app/shortcuts.ts`, `src/app/useEditorShortcuts.ts`, `src/ui/shortcutList.ts` | a seção `Atalhos.md` |
| `src/i18n/**` | só quando muda um rótulo que aparece num preview ou num guia |

A lista é um filtro rápido, não um limite: uma mudança em `src/model/` ou `src/store/` que altere **o que a pessoa vê na tela** também conta — foi o caso de `src/store/proposedCatalog.ts` (visão Proposto) e de `src/store/imagePermissions.ts` (Privacidade).

**Nunca dispara:** testes, `examples/`, `libraries/`, `viewer/demo/`, `mcp/`, `scripts/` e documentação.

## Como verificar, fase a fase

1. Cruze o "Toca em:" da fase (na sub-issue da fase, rótulo `step`) com a tabela acima e com o mapa.
2. Declare o resultado no item **Impacto no DS** da descrição do PR: `nenhum`, ou o que a mudança afeta.
3. Se não for `nenhum`, acrescente a pendência na seção `## Pendências` de `docs/design-system/<nome>.md` (o arquivo do épico, `<nome>` é o branch sem `epic/`; crie-o com a data `[Não lançado]` se ainda não existir), no mesmo PR, com o que mudou e os arquivos que provam.

Nenhuma fase grava no artefato do DS.

## Quando atualizar

- **As fases** registram as pendências na seção `## Pendências` de `docs/design-system/<nome>.md`, o arquivo do épico. Nenhuma fase grava no artefato.
- **O fechamento de todo épico** aplica as pendências no artefato, preenche `## Sincronização` do arquivo do épico (o que gravou e as versões, ou "Sem impacto" e por quê), passa o que não gravou para `## Ficou sem gravar` e renomeia o arquivo para `docs/design-system/AAAA-MM-DD-<nome>.md` (`git mv`, e a mesma data no título). É a única hora em que se grava no DS, por dois motivos: pessoas editam o DS ao vivo, e o índice (`project/design-system.json`) precisa ser lido imediatamente antes de cada gravação — uma gravação por épico evita conflito e idas e vindas.
- **Pendências abertas** de épicos anteriores acham-se com Grep em `## Ficou sem gravar` na pasta. Quem resolve uma a tira do arquivo antigo e registra no arquivo do próprio épico.

Ao gravar:

- **Ferramenta:** `Artifact`, com `read` (`url` e `path`) para ler e `publish` (`url`, `root` e `files`) para gravar. Leia o `SKILL.md` e o `artifact-type/reference/` do artefato antes.
- **`## Sincronização`** do registro abre por uma destas três formas: "Gravado no artefato **Mapping** em AAAA-MM-DD: versão <n>…", "Versão <n>…" (ou "Versões <n> e <m>…") ou "Sem impacto…". Qualquer outra abertura conta como "não gravou", e o teste `tests/tooling/designSystemLog.test.ts` exige então `## Ficou sem gravar` com cada item explicado.
- **O índice vai por último**, numa chamada só, lido imediatamente antes, com `lastChange` preenchido (`by`, `at`, `via`, `note`).
- **Nenhum arquivo do DS é apagado** sem o dono pedir.
- Confira o contraste nos temas claro e escuro em tudo o que tocar.
- As instruções completas do formato estão no próprio artefato (`SKILL.md` e `artifact-type/reference/`), e devem ser lidas antes de gravar.

## Mapa

Cada componente do DS e a origem dele no código. Um nome do DS pode cobrir vários arquivos, e alguns correspondem a uma função local, não a um componente exportado — a coluna "Observação" diz quando é o caso. Componente desenhado no canvas não tem `.tsx`: a origem é o renderer e a geometria.

### Componentes: controles e moldura da app

| Componente | Origem no código | Observação |
| --- | --- | --- |
| `Button` | `src/ui/controls/Button.tsx` | Inclui o `LinkButton`. |
| `IconButton` | `src/ui/controls/IconButton.tsx` | Inclui o `IconLink`; usa `Tooltip`. |
| `TextField` | `src/ui/controls/TextField.tsx`, `src/ui/CommitInput.tsx` | Inclui o `TextArea`; o `CommitInput` dá o `onCommit`. |
| `Select` | `src/ui/controls/Select.tsx` |  |
| `Choice` | `src/ui/controls/Choice.tsx` | Caixa e rádio. |
| `Segmented` | `src/ui/controls/Segmented.tsx` |  |
| `Tabs` | `src/ui/controls/Tabs.tsx`, `src/ui/BottomTabs.tsx` | `BottomTabs` é o uso na janela inferior. |
| `Tooltip` | `src/ui/controls/Tooltip.tsx` |  |
| `HelpTip` | `src/ui/controls/HelpTip.tsx` | Usa `Tooltip` e o ícone `info`; padrão "explicação = ícone com dica". |
| `Menu` | `src/ui/MenuPopover.tsx`, `src/ui/ActionMenu.tsx`, `src/ui/CanvasContextMenu.tsx`, `src/ui/CopyActions.tsx`, `src/ui/Popover.tsx` | Três menus num guia só; `Popover` é a base de posicionamento. |
| `Dialog` | `src/ui/Dialog.tsx` |  |
| `ConfirmDialogs` | `src/app/EditorDialogs.tsx`, `src/app/useEditorDialogs.ts` | `ConfirmDialog` e `ExternalChangeDialog` moram no `EditorDialogs.tsx`. |
| `Banner` | `src/ui/Banner.tsx`, `src/ui/PreviewBanner.tsx`, `src/ui/UpdateBanner.tsx` |  |
| `Notice` | `src/ui/Notice.tsx`, `src/ui/InstallHint.tsx` | O `InstallHint` usa o `Notice` (tom `info`, com `title` e `actions`); o `.notice` de parágrafo continua no CSS. |
| `NoticeBadge` | `src/ui/NoticeBadge.tsx` | Selo, bloco e linha dos quatro `kind` de aviso da especialização (`NoticeBadge`, `TypeNoticeBadge`, `NoticeBlock`, `NoticeLines`); cor sempre com ícone e texto. |
| `Tags` | `src/ui/controls/Chip.tsx` | Etiqueta de camada em `src/ui/ListView.tsx`. |
| `Breadcrumbs` | `src/ui/Breadcrumbs.tsx` | Controles à direita da barra em `src/app/EditorTools.tsx` e `src/ui/ZoomField.tsx`. |
| `StatusBar` | `src/ui/StatusBar.tsx` |  |
| `PerspectivePicker` | `src/ui/PerspectivePicker.tsx` | só guia, sem preview |
| `PerspectiveDialogs` | `src/ui/NewPerspectiveDialog.tsx`, `ManagePerspectivesDialog.tsx`, `DeletePerspectiveDialog.tsx` | só guia, sem preview |
| `PerspectivesSection` | `src/ui/PerspectivesSection.tsx`, `ArrivalNotice.tsx` | só guia, sem preview |
| `ToolWindow` | `src/ui/ToolWindow.tsx` | Tamanhos em `src/ui/toolWindowLayout.ts`; montagem em `src/app/EditorWindows.tsx`. |
| `ToolStripButton` | `src/ui/ToolStrip.tsx` | É o `StripButton`, não exportado; metadados em `src/ui/toolWindowMeta.ts`. |
| `NarrowWindow` | `src/app/NarrowWindow.tsx` | Exporta `NarrowWindowNotice` e `useNarrowWindow`; limite em `src/theme/breakpoints.ts`. |
| `Home` | `src/app/Home.tsx` | Linhas dos recentes em `src/app/recentRows.ts`. |
| `HelpDialog` | `src/ui/HelpDialog.tsx` | Atalhos de `src/ui/shortcutList.ts`. |
| `Cover` | — | Capa do DS; não tem guia nem equivalente no código. |

### Componentes: canvas, marcações e painéis de detalhes

| Componente | Origem no código | Observação |
| --- | --- | --- |
| `Arrow` | `src/canvas/renderers/arrows.ts`, `src/canvas/arrowGeometry.ts`, `src/canvas/renderers/overlay.ts` | Desenhada no Konva; sem `.tsx`. |
| `ArrowPanel` | `src/ui/ArrowPanel.tsx` |  |
| `CanvasMarking` | `src/canvas/renderers/markings.ts`, `src/canvas/renderers/overlay.ts`, `src/canvas/renderers/lockBadge.ts`, `src/canvas/renderers/review.ts`, `src/canvas/theme.ts` | Especificação do desenho no Konva, não componente Preact; geometria em `src/canvas/markingGeometry.ts`. |
| `Container` | `src/canvas/renderers/images.ts`, `src/canvas/renderers/overlay.ts`, `src/canvas/renderers/review.ts` | Desenhado no Konva; sem `.tsx`. |
| `ContainerDialog` | `src/ui/ContainerDialog.tsx`, `src/ui/containerForm.ts` |  |
| `ComponentDrawing` | `src/canvas/components/componentLayer.ts`, `src/canvas/components/renderScene.ts`, `src/canvas/components/screenRenderer.ts` | Desenhado no Konva; nó `image` via `imageLoader.ts` e `remoteImages.ts`. |
| `Minimap` | `src/ui/Minimap.tsx`, `src/canvas/minimap.ts` | DOM, não Konva; contas de layout no canvas. |
| `ZoomField` | `src/ui/ZoomField.tsx` | Usado em `src/ui/StatusBar.tsx` e `src/ui/Breadcrumbs.tsx`. |
| `ViewModePanel` | `src/ui/ViewModePanel.tsx` | Painel "Mostrar no canvas" do modo visualização e o botão que o reabre; o botão **Visualizar** (`ViewModeButton`) mora em `src/app/EditorTools.tsx`. O item do modo na barra de status é `ViewModeItem`, em `src/ui/StatusBar.tsx` (guia do `StatusBar`). |
| `MarkingPanel` | `src/ui/MarkingPanel.tsx` |  |
| `MarkingPicker` | `src/ui/MarkingPicker.tsx` |  |
| `MultiSelectionPanel` | `src/ui/MultiSelectionPanel.tsx` |  |
| `LayerGroup` | `src/ui/AnnotationsPanel.tsx`, `src/ui/LayersPanel.tsx` | `LayerGroup` é função interna do `AnnotationsPanel.tsx`; o guia cobre também a lista de camadas (`LayersPanel`, janela em `LayersWindow.tsx`). |
| `TreeRow` | `src/ui/MarkingTree.tsx` | Linha da Árvore; janela em `src/ui/TreeWindow.tsx`. |
| `KeyValueGrid` | `src/ui/KeyValueGrid.tsx` |  |
| `PropertyGrid` | `src/ui/PropertyGrid.tsx` |  |
| `DataGrid` | `src/ui/TableField.tsx`, `src/ui/ListView.tsx` | Dois usos sob um nome: campo `table` dos Detalhes e Lista em tabela. `LayerCell` e `MarkingCell` (botão da primeira coluna) são exportados do `ListView.tsx` e também usados por `IncompleteView.tsx` e `NoticesView.tsx`. |
| `RefCell` | `src/ui/RefCell.tsx`, `src/ui/RefPicker.tsx` | Seletor em modo `compact`. |
| `ReferenceField` | `src/ui/TypedFields.tsx`, `src/ui/RefPicker.tsx` | `RefField` é função interna do `TypedFields.tsx`. |
| `InconsistentProjectDialog` | `src/ui/InconsistentProjectDialog.tsx` | Aberto por `src/app/Home.tsx`. |

### Componentes: revisão, propostas, catálogo e configurações

| Componente | Origem no código | Observação |
| --- | --- | --- |
| `ChangeBelow` | `src/ui/review/ChangeBelow.tsx` |  |
| `ChangeKind` | `src/ui/review/ChangeKind.tsx` |  |
| `ChangeMark` | `src/ui/review/ChangeMark.tsx` |  |
| `ChangePopover` | `src/ui/review/ChangePopover.tsx` |  |
| `DecisionControl` | `src/ui/review/DecisionControl.tsx` | Também exporta `REVIEW_KEYS` (atalhos A, R, Backspace). |
| `DecisionMark` | `src/ui/review/DecisionMark.tsx` |  |
| `DiffValue` | `src/ui/review/DiffValue.tsx` |  |
| `Flag` | `src/ui/review/Flag.tsx` |  |
| `ImageCompare` | `src/ui/review/ImageCompare.tsx` | Aberto por `CompareDialog` em `src/ui/review/ReviewCanvasControls.tsx`. |
| `NoteField` | `src/ui/review/NoteField.tsx` |  |
| `OtherChanges` | `src/ui/review/OtherChanges.tsx` | Exporta `OtherChangesSection`, `OtherChangeRow` e `ImagesSection`. |
| `ProposalRow` | `src/ui/review/ProposalRow.tsx` | Usada em `ProposalList.tsx`; também exporta `DecisionCounts`. |
| `ReviewBar` | `src/ui/review/ReviewBar.tsx` |  |
| `ReviewHeader` | `src/ui/review/ReviewHeader.tsx` | Exporta também `IdentityFlags`. |
| `ReviewRow` | `src/ui/review/ReviewRow.tsx` | Usada em `ReviewLevels.tsx`; o guia e a prévia cobrem também a linha de filtros recolhida e o painel aberto. |
| `UpdateImpact` | `src/ui/UpdateImpact.tsx` |  |
| `CatalogPage` | `src/ui/catalog/CatalogPage.tsx` | Também `CatalogView.tsx`, `Playground.tsx`, `renderer.ts` e `src/ui/markdown/Markdown.tsx`. |
| `CatalogScreen` | `src/app/CatalogScreen.tsx` | Usa `src/store/libraryPreview.ts`. |
| `CatalogWindow` | `src/ui/CatalogWindow.tsx` | Também `LibraryPalette.tsx` e `useAddComponent.ts`. |
| `CodeDefinitions` | `src/ui/CodeDefinitions.tsx` | Resolve a variante por `typeCodeDefinitions` (`src/model/codeVariants.ts`). |
| `SpecsDialog` | `src/ui/SpecsDialog.tsx` | Também `specPackageImport.ts`. |
| `LibraryIssueList` | `src/ui/LibraryIssueList.tsx` |  |
| `NoticesView` | `src/ui/NoticesView.tsx`, `src/ui/BottomTabs.tsx` | Janela Avisos (`Ctrl+Shift+8`): filtros, grupos por aviso e a aba com contagem. |
| Janela Comentários | `src/ui/toolWindowMeta.ts`, `src/store/toolWindows.ts` | Aba da janela inferior, a última (`WINDOW_NUMBER.comments = 0`, atalho `Ctrl+Shift+0`, ícone `chat`). |
| `SettingsDialog` | `src/ui/SettingsDialog.tsx` | Também `SettingsBar.tsx`, `PlatformRepos.tsx` e `PrivacySettings.tsx`. |

### Componentes: conversas e comentários

| Componente | Origem no código | Observação |
| --- | --- | --- |
| `CommentPin` | `src/canvas/commentPins.ts`, `src/canvas/renderers/commentPins.ts`, `src/canvas/theme.ts` | Pino desenhado no Konva; sem `.tsx`; só guia, sem preview. |
| `CitationChip` | `src/ui/comments/CitationChip.tsx`, `CitationEditor.tsx`, `CitePicker.tsx` | Só guia, sem preview. |
| `ThreadMessage` | `src/ui/comments/ThreadMessage.tsx`, `ThreadView.tsx` | Só guia, sem preview. |
| `ThreadsSection` | `src/ui/comments/ThreadsSection.tsx` | Seção Conversas dos Detalhes; só guia, sem preview. |
| `Composer` | `src/ui/comments/Composer.tsx` | Só guia, sem preview. |
| `CommentsWindow` | `src/ui/comments/CommentsWindow.tsx`, `StandaloneThreadPanel.tsx` | Conteúdo da janela Comentários (a aba está em "Janela Comentários", acima); só guia, sem preview. |
| `ProposalCard` | `src/ui/comments/ProposalCard.tsx` | Só guia, sem preview. |
| `DeleteThreadDialogs` | `src/ui/comments/useDeleteThread.tsx`, `BulkDeleteDialog.tsx`, `deleteText.ts` | Só guia, sem preview. |
| `ReferencedByRow` | `src/ui/ReferencedBy.tsx` | Linha "Referenciada por" do `AnnotationEditor`; só guia, sem preview. |

### Seções

| Seção | Origem | Estado |
| --- | --- | --- |
| `README.md` | o livro da marca; sem origem única no código | Autoral. |
| `Atalhos.md` | `src/app/shortcuts.ts`, `src/app/useEditorShortcuts.ts`, `src/ui/shortcutList.ts`, `src/ui/review/DecisionControl.tsx`, `src/store/toolWindows.ts` | Em dia. |
| `Canvas.md` | `src/canvas/theme.ts`, `src/canvas/renderers/`, `src/canvas/reviewMarks.ts`, `src/canvas/viewport.ts`, `src/canvas/input/`, `src/canvas/components/` | Em dia desde 2026-11-02 (fantasma nas duas visões, componente criado, nó `image`). |
| `Conceitos.md` | `docs/FORMAT.md` (schema v13), `src/model/` (`hierarchySettle.ts`, `arrows.ts`, `locks.ts`, `componentDrawings.ts`), `docs/PROPOSAL-FORMAT.md` | Em dia. |
| `Contraste.md` | `src/theme/tokens.ts`, `tests/theme/` (`contrast`, `tokens`, `tokenLiterals`, `canvasLiterals`) | Valores em dia; as razões não foram recalculadas. |
| `Layouts.md` | `src/app/Editor*.tsx`, `src/app/Home.tsx`, `src/app/NarrowWindow.tsx`, `src/ui/toolWindowLayout.ts`, `src/ui/ToolWindow.tsx`, `src/theme/` | Em dia nas medidas. |
| `Revisao.md` | `src/ui/review/`, `src/canvas/reviewMarks.ts`, `src/canvas/renderers/review.ts`, `src/store/proposedCatalog.ts`, `src/store/review.ts` | Em dia desde 2026-11-02. |

### Tokens

Fonte única: `src/theme/tokens.ts` (tema claro e escuro). O canvas lê os tokens por `src/canvas/theme.ts`. O DS guarda a mesma lista em `project/tokens.json`.

Conferido em 2026-11-02 por nome e por valor, nos dois temas: nenhum token do DS falta no código, e **nenhum valor divergiu**. Sete tokens de cor só diferem na notação do alias (`{x}` no DS, `var(--x)` no código) e resolvem para o mesmo valor.

Na mesma data entraram no DS os sete que faltavam: `size-grid-col-min` (`96px`) e os papéis `control-height`, `control-height-sm`, `control-icon`, `control-check`, `row-height` (família `size`) e `control-radius` (família `radius`). Os papéis importam porque o `CLAUDE.md` manda o CSS usar só os `--control-*`, não os tokens crus; como o formato só aceita alias em cor, cada papel entrou com o valor literal e o `usage` diz qual token ele representa.

| Família                            | No DS | No código       |
| ---------------------------------- | ----- | --------------- |
| `color` (inclui `cv-*`, `layer-*`) | 72    | 72              |
| `type` (estilos `t-*`)             | 12    | 12 (+ 5 alias)  |
| `spacing`                          | 9     | 9               |
| `radius`                           | 7     | 7               |
| `shadow`                           | 1     | 1               |
| `size`                             | 61    | 56 (+ 5 papéis) |
| `opacity`                          | 11    | 11              |
| `duration`                         | 6     | 6               |
| `zIndex`                           | 8     | 8               |
| `breakpoint`                       | 2     | 2               |

Contagem conferida em 2026-11-10 (DS3, `tokens.json` do artefato na versão 69 contra `src/theme/tokens.ts`, nome e valor nos dois temas): 177 tokens nas listas, 21 deles entrados na DS3 (os seis `color-thread-*`, `cv-component-unknown-fill`, `opacity-slot`, os onze `size-cv-pin-*` e `size-cv-arrival-*` e os dois `size-minimap-*`; `size-tw-bottom` passou a `360px`). Os cinco papéis de `size` (`control-height`, `control-height-sm`, `control-icon`, `control-check`, `row-height`) são alias no código e valores literais no DS. A divergência antiga de `size-review-col-name-min` (194px no código, 208px no DS) foi corrigida na DS5 (versão 71): o DS passou a 194px.

Falta no DS só os cinco alias de texto `t-text`, `t-text-small`, `t-text-heading`, `t-text-title` e `t-text-input`, por limite do formato (ver Pendências).

### Ícones

Fonte única: `src/ui/icons.tsx` (SVG inline, grade de 16 px, traço de 1,25, `currentColor`). O DS guarda cada ícone como um upload no grupo `Icons`.

Conferido em 2026-11-10 (DS3): **92 ícones no DS, 92 em `icons.tsx`**, com os dois novos `thread-awaiting-human` e `thread-awaiting-agent` (chaves `threadAwaitingHuman` e `threadAwaitingAgent`). Antes, em 2026-11-04: **86 ícones no DS, 86 em `icons.tsx`, correspondência 1:1**, sem sobra de nenhum lado (o 86º é `container-mark`, chave `containerMark`, logo depois de `container`). A única diferença é a convenção de nome — o DS usa o nome do arquivo em kebab-case (`zoom-in.svg`), o código usa a chave em camelCase (`zoomIn`). Ao acrescentar um ícone, mantenha os dois nomes correspondentes.

## Com forma visível e sem componente no DS

Levantado em 2026-11-02. Estes arquivos aparecem na tela e nenhum guia do DS os cobre. **Não são pendência:** entrar ou não no DS é decisão do dono, e criar componente novo está fora do escopo da etapa de sincronia.

- Diálogos: `src/ui/review/ExitReviewDialog.tsx`, `src/app/ExportDialog.tsx`, `src/ui/SpecsDialog.tsx`, `src/ui/InconsistentProjectDialog.tsx` (os três últimos só citados no guia de `Dialog`), `src/ui/LinkDialog.tsx`, `src/ui/TypePicker.tsx`.
- Barras e faixas: `src/app/EditorMainBar.tsx`, `src/app/EditorTools.tsx`, `src/ui/SettingsBar.tsx`, `src/ui/ImageConsentBanner.tsx`, `src/ui/InstallHint.tsx`, `src/ui/review/ProposalNotices.tsx`.
- Revisão: `src/ui/review/ReviewLevels.tsx` (a barra de progresso; os filtros recolhidos e o painel aberto estão no guia e na prévia do `ReviewRow`), `src/ui/review/ProposalList.tsx` (a busca e o estado vazio), `src/ui/review/ReviewCanvasControls.tsx` (o alternador Atual/Proposto e a legenda das marcas), `src/ui/review/RevisedBefore.tsx` (o bloco "Antes da revisão").
- Detalhes e campos: `src/ui/FieldEditors.tsx`, `src/ui/CommitInput.tsx`, `src/ui/AnnotationEditor.tsx`, `src/ui/AnnotationSummary.tsx`, `src/ui/DetailsSection.tsx`, `src/ui/DetailsIdentity.tsx`, `src/ui/MarkingColorField.tsx`, `src/ui/OwnerRoleField.tsx`, `src/ui/LinkedAnnotations.tsx`, `src/ui/IdentitySettings.tsx`.
- Configurações: `src/ui/PrivacySettings.tsx`, `src/ui/PlatformRepos.tsx`.
- Outros: `src/ui/Popover.tsx`, `src/ui/LibraryPalette.tsx`, `src/ui/DiagnosticsView.tsx`, `src/ui/IncompleteView.tsx`, `src/ui/LayersWindow.tsx`, `src/ui/TreeWindow.tsx`, `src/ui/comments/CitePicker.tsx`, `src/ui/comments/StandaloneThreadPanel.tsx`, `src/ui/comments/CitedIn.tsx`.

Composições e lógica sem forma própria (não precisam de componente): `src/ui/SelectionPanel.tsx`, `src/ui/review/ReviewPanel.tsx`, `ReviewDetails.tsx`, `ProposalsWindow.tsx`, `reviewExtension.tsx`, `changeText.ts`, `levelRows.ts`, `src/canvas/reviewMarks.ts`, `src/store/proposedCatalog.ts`, `src/canvas/frame.ts`, `containment.ts`, `gestureMachine.ts`, `input/`, `viewportController.ts`.

## Botões avulsos

Decisão do dono de 2026-11-08 (etapa #954, item 38): o `<button>` de **ação comum** vem de `src/ui/controls/` (`Button`, `IconButton`); o de **papel próprio** fica como está, com o comentário `Exceção ao Button: <papel>` no código (um teste confere os arquivos abaixo). Nenhum controle novo e nenhuma mudança visual. Estas são as exceções dos arquivos do item 38:

| Arquivo | Botão | Papel |
| --- | --- | --- |
| `src/ui/StatusBar.tsx` | "Tentar novamente" do erro de gravação | link de texto na mensagem (`.link`) |
| `src/ui/StatusBar.tsx` | propostas novas, avisos e conversas abertas | segmento da barra de status (`.status-item-button`) |
| `src/ui/ReferencedBy.tsx` | cada origem de "Referenciada por" | link de texto (`.link-button`) |
| `src/ui/PerspectivePicker.tsx` | linha da lista | opção de lista (`role="option"`) |
| `src/ui/PerspectivePicker.tsx` | gatilho da perspectiva | cara de select (`.menu-trigger`) |
| `src/ui/ZoomField.tsx` | campo de zoom | mostra o valor e volta a 100% |
| `src/ui/TypedFields.tsx`, `src/ui/RefCell.tsx` | campo e célula `ref` | campo de referência com cara de select (`.ref-control`) |
| `src/ui/TypedForm.tsx`, `src/ui/TableField.tsx` | campo `ref` desabilitado (formulário de tipo e coluna da tabela sem seletor) | o mesmo `.ref-control` |
| `src/ui/TableField.tsx` | alça da linha | alça de arraste (`.grid-grip`) |
| `src/ui/catalog/CatalogView.tsx` | tipo da lista | opção de lista (`.catalog-entry`) |
| `src/ui/review/ChangeMark.tsx` | marcador de mudança | abre o popover da mudança e leva os atalhos A, R e Backspace (`.change-mark`) |
| `src/ui/review/ReviewBar.tsx` | "N conjuntos inválidos" | selo de problema clicável (`.flag.flag-danger`) |
| `src/app/Home.tsx` | itens da faixa lateral (Projetos, Ajuda, Configurações) | item de navegação, com `aria-current="page"` no atual (`.home-nav-item`) |

## Pendências

O que o código já tem e o DS ainda não descreve e **não é de um épico** em particular. As pendências de cada épico ficam em `docs/design-system/<nome>.md` (ver "Quando atualizar").

### Previews não mostram o estado novo

A sincronia de 2026-11-02 corrigiu os guias de todos os componentes afetados, mas só acrescentou o estado novo ao preview de seis deles (decisão de escopo do dono). Continuam mostrando o estado antigo os previews de:

- `ChangeMark`, `ChangePopover`, `ReviewBar`, `ReviewHeader`, `OtherChanges`: a visão Proposto desenha os componentes criados e a criação rejeitada vira fantasma nas duas visões. Em boa parte deles a mudança é comportamento do canvas, que o preview não desenha — confira caso a caso se vale mexer.
- `PropertyGrid`, `KeyValueGrid`, `DataGrid`, `ReferenceField`: o vocabulário sugerido do campo `string` (o preview do `TextField` já o mostra).
- `Breadcrumbs`: a dica (`title`) no nome cortado (o preview do `LayerGroup` já mostra o selo cortado com a dica, desde o `epic/selo-nomes-acessiveis`).

### Classes que faltam no `bundle.css`

Os previews de `TextField`, `SettingsDialog`, `CatalogPage` e `Home` declaram no próprio `<style>` classes que a app tem e o `bundle.css` do DS não: `.suggestions`, `.suggestion`, `.suggestion-label`, `.suggestion-detail` (na app, em `src/theme/editor.css`), `.privacy-*` (em `src/theme/layout.css`), `.catalog-variants-caption` e o `white-space: nowrap` de `.project-actions .button` e `.project-table .badge` (em `src/theme/layout.css`, desde o `epic/acabamento-900`). Desde o `epic/papeis-e-docs-externos` somam-se `.external-doc`, `.external-doc-actions`, `.external-doc-link`, `.external-doc-path` (em `src/theme/catalog.css`), `.repos-group` e `.repos-subtitle` (em `src/theme/layout.css`), declaradas nos previews de `CatalogPage` e `SettingsDialog`; e, só descritas nos guias, `.type-search`, `.type-section`, `.type-group-title` e `.linked-role-*`. Funciona, mas o certo é o bundle ganhar essas classes quando for regerado, e os previews pararem de declará-las.

### Alias de texto fora do `tokens.json`

Os cinco papéis de texto do código não entraram no DS: a família `type` do formato só aceita `fonts`, `families` e `groups.styles`, com valores reais de fonte, e não tem onde guardar um alias de estilo. Registrá-los como estilos duplicados poluiria a Typography. A correspondência, de `src/theme/tokens.ts`:

| Papel            | Aponta para |
| ---------------- | ----------- |
| `t-text`         | `t-body`    |
| `t-text-small`   | `t-small`   |
| `t-text-heading` | `t-heading` |
| `t-text-title`   | `t-title`   |
| `t-text-input`   | `t-body`    |

### A conferir

- **`}` sobrando no `<style>` de preview.** Achado e corrigido em `MultiSelectionPanel` e `CodeDefinitions`, nos dois no fim do bloco de regras de hover, que parece copiado entre previews. Os outros previews não foram varridos: vale um passe conferindo o balanceamento de chaves em todos. A verificação da gravação do `epic/selo-nomes-acessiveis` (2026-11-04) achou o mesmo `}` sobrando, já existente, também nos previews de `LayerGroup`, `TreeRow`, `MarkingPanel`, `ArrowPanel`, `RefCell` e `ReferenceField`; não foi corrigido.
- **Limpeza visual (gravação de 2026-11-04).** `Notice`: o exemplo `.notice .notice-info` do preview ainda usa o texto do aviso de trava da seta ("Trancada: a rota, as pontas..."), que a app não mostra mais como parágrafo (virou `HelpTip`); `.notice-info` segue em uso na app (`CanvasNotices`, seletores, `InstallHint`, `AnnotationEditor`). Não há preview do painel da imagem (container) trancado: o `SelectionPanel` não tem componente no DS ("Composições e lógica sem forma própria"); o estado ficou descrito no guia do `MarkingPanel`. No preview do `CatalogWindow`, um seletor `.ds-state-hover .tab:not(:disabled{...}` está sem o parêntese de fechamento (não se sabe se já era assim). Os previews de `ArrowPanel`, `MarkingPanel`, `PropertyGrid`, `LayerGroup` e `ReferenceField` têm ids repetidos (`P0-0`, `P0-1`...), vindos do preview renderizado da app com vários estados; os ids do `HelpTip` são únicos. Não se provou, sem cópia da versão 26, que o texto dos autores foi preservado byte a byte fora dos trechos da limpeza visual.
- **Altura dos cartões.** Os `height=` dos seis previews alterados em 2026-11-02 foram estimados, não vistos num navegador: `TextField` 710 → 1010, `SettingsDialog` 2800 → 6000, `CodeDefinitions` 230 → 640, `CatalogPage` 1800 → 2300, `MultiSelectionPanel` 662 → 860, `ComponentDrawing` 620 (sem mudança). Confira se algum cartão corta.
- **Contraste.** Os previews alterados não foram vistos num navegador nos dois temas; o texto novo usa os tokens existentes, mas a conferência visual não foi feita.
- `ReviewHeader`: o guia descreve "Aceitar remoção" e "+ N anotações criadas"; o comportamento não foi confirmado linha a linha contra `ReviewHeader.tsx`.
- `Contraste.md`: as razões de contraste não foram recalculadas, só os valores dos tokens.
- `Notice`: o guia diz que `.notice-error` e `.notice-success` não têm uso na app; não conferido no CSS.
- `TextField`: o `StringEditor` passou a tirar a quebra de linha do fim do texto ao gravar (`src/ui/FieldEditors.tsx`, vindo do `epic/exemplos-enxutos`). O guia descreve o `onCommit` e não cita isso; decida se vale uma linha.
- `Revogar` uma origem: o guia do `SettingsDialog` diz que o próximo uso volta a pedir consentimento. `revokeOrigin` só tira a origem da lista, e o resto é inferência — confirme contra `src/store/imagePermissions.ts`.

## Histórico de sincronização

Um arquivo por épico em [`docs/design-system/`](design-system/), com o que o fechamento gravou no artefato (ou "Sem impacto") e o que ficou sem gravar. `ls docs/design-system/` sai em ordem cronológica, com os não lançados (`<nome>.md`, sem data) no fim; épicos do mesmo dia ficam em ordem alfabética, e a ordem exata do merge é a de `git log --first-parent main`. A primeira linha de cada arquivo é `# <Etapa> — <AAAA-MM-DD | [Não lançado]> (épico \`epic/<nome>\`)`, e as seções são só `## Pendências`, `## Sincronização`e`## Ficou sem gravar`. As pendências abertas acham-se com `grep -rn -A99 '^## Ficou sem gravar' docs/design-system/`.

Cada item de `## Ficou sem gravar` traz `Motivo:` (o que impediu a gravação, concreto) ou "Passou para o registro do épico `epic/<nome>`: <resumo>", quando outro épico passou a gravá-lo; o registro desse épico tem de existir na pasta.
