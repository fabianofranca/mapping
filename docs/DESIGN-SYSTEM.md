# Design system

The Mapping design system (DS) is the **Mapping** artifact of Claude Design:

<https://claude.ai/artifact/HEoYNh91CqK1YDDpjXBxi9>

This file is its record in the repository. It says what the DS is, **when** a phase needs to look at the DS, **when** the DS is updated, which part of the DS corresponds to which part of the code, and the pending items that do not belong to an epic. What each epic asked for and what the closing wrote is kept in one file per epic in [`docs/design-system/`](design-system/), which the `epic` job of `ci.yml` requires in the PR of every epic.

## What the DS is, and what it is not

- **It is hand-curated.** Each component has a guide (`README.md`) and an HTML preview written by people, with the states drawn one by one. The content has authors: when updating, touch only what the delivery changed. This does not stop the closing from writing: it means touching only what the delivery changed, without `/design-sync`.
- **It is not generated from the code.** The Claude Code skill `/design-sync` **does not apply** to this DS: it expects the `dist/` of a published component library and would turn the curated DS into a mirror of the build. Do not use it here.
- **The code is the source of truth; the DS describes.** Where the two diverge, fix the DS. A divergence that looks like a defect of the app is not resolved here: record it in "Pending items" and take it to the owner.
- **Name.** The artifact's index is called **Mapping**. If the old name "Mapeador de Imagens 2.0" shows up, it is the same artifact.
- **Size today:** 79 components with a guide (plus the `Cover` cover), 6 sections, 177 tokens (not counting the 12 `t-*` text styles) and 92 icons (artifact at version 71, DS5 of the `sincronia-ds-2` epic).

## When to check

If the phase's "Toca em:" (in the phase sub-issue, on GitHub) crosses any path below, the phase needs to look at the DS. It is a reading of the map: it does not require opening the artifact.

| Changed in the code | Look in the DS |
| --- | --- |
| `src/ui/controls/**` | `Button`, `IconButton`, `TextField`, `Select`, `Choice`, `Segmented`, `Tabs`, `Tooltip`, `HelpTip`, `Tags` |
| `src/ui/**` (outside `controls/`, `review/` and `comments/`) | the matching component in the map: panels, windows, dialogs and bars |
| `src/ui/review/**` | the review components and the `Revisao.md` section |
| `src/ui/comments/**`, `src/canvas/commentPins.ts`, `src/canvas/renderers/commentPins.ts`, `src/theme/threads.css` | the comment components (`CommentPin`, `CitationChip`, `ThreadMessage`, `ThreadsSection`, `Composer`, `CommentsWindow`, `ProposalCard`, `DeleteThreadDialogs`) and the `Canvas.md` section (pin) |
| `src/ui/catalog/**` | `CatalogPage`, `CatalogScreen`, `CatalogWindow` |
| `src/app/Home.tsx`, `NarrowWindow.tsx`, `CatalogScreen.tsx`, `Editor*.tsx`, `*Dialog*.tsx` | `Home`, `NarrowWindow`, `ConfirmDialogs`, `ToolWindow` and the `Layouts.md` section |
| `src/canvas/renderers/**`, `src/canvas/components/**`, `theme.ts`, `viewport.ts`, `minimap.ts` | `Arrow`, `CanvasMarking`, `Container`, `ComponentDrawing`, `Minimap` and the `Canvas.md` section |
| `src/theme/tokens.ts` | `tokens.json` and the `Contraste.md` section |
| `src/ui/icons.tsx` | the `Icons` icon group |
| `src/app/shortcuts.ts`, `src/app/useEditorShortcuts.ts`, `src/ui/shortcutList.ts` | the `Atalhos.md` section |
| `src/i18n/**` | only when a label that appears in a preview or a guide changes |

The list is a quick filter, not a limit: a change in `src/model/` or `src/store/` that alters **what the person sees on screen** also counts — as was the case of `src/store/proposedCatalog.ts` (Proposed view) and of `src/store/imagePermissions.ts` (Privacy).

**Never triggers it:** tests, `examples/`, `libraries/`, `viewer/demo/`, `mcp/`, `scripts/` and documentation.

## How to check, phase by phase

1. Cross the phase's "Toca em:" (in the phase sub-issue, label `step`) with the table above and with the map.
2. Declare the result in the **DS impact** item of the PR description: `none`, or what the change affects.
3. If it is not `none`, add the pending item to the `## Pendências` section of `docs/design-system/<name>.md` (the epic's file, `<name>` is the branch without `epic/`; create it with the date `[Não lançado]` if it does not exist yet), in the same PR, with what changed and the files that prove it.

No phase writes to the DS artifact.

## When to update

- **The phases** record the pending items in the `## Pendências` section of `docs/design-system/<name>.md`, the epic's file. No phase writes to the artifact.
- **The closing of every epic** applies the pending items to the artifact, fills in `## Sincronização` of the epic's file (what it wrote and the versions, or "Sem impacto" and why), moves what it did not write to `## Ficou sem gravar` and renames the file to `docs/design-system/YYYY-MM-DD-<name>.md` (`git mv`, and the same date in the title). It is the only time anything is written to the DS, for two reasons: people edit the DS live, and the index (`project/design-system.json`) must be read immediately before each write — one write per epic avoids conflicts and back-and-forth.
- **Open pending items** from earlier epics are found with Grep on `## Ficou sem gravar` in the folder. Whoever resolves one removes it from the old file and records it in the file of their own epic.

When writing:

- **Tool:** `Artifact`, with `read` (`url` and `path`) to read and `publish` (`url`, `root` and `files`) to write. Read the artifact's `SKILL.md` and `artifact-type/reference/` first.
- **`## Sincronização`** of the record opens in one of these three forms: "Gravado no artefato **Mapping** em AAAA-MM-DD: versão <n>…", "Versão <n>…" (or "Versões <n> e <m>…") or "Sem impacto…". Any other opening counts as "did not write", and the test `tests/tooling/designSystemLog.test.ts` then requires `## Ficou sem gravar` with each item explained.
- **The index goes last**, in a single call, read immediately before, with `lastChange` filled in (`by`, `at`, `via`, `note`).
- **No DS file is deleted** unless the owner asks.
- Check the contrast in the light and dark themes on everything you touch.
- The complete instructions of the format are in the artifact itself (`SKILL.md` and `artifact-type/reference/`), and must be read before writing.

## Map

Each DS component and its origin in the code. A DS name can cover several files, and some correspond to a local function, not an exported component — the "Notes" column says when that is the case. A component drawn on the canvas has no `.tsx`: the origin is the renderer and the geometry.

### Components: controls and app frame

| Component | Origin in the code | Notes |
| --- | --- | --- |
| `Button` | `src/ui/controls/Button.tsx` | Includes the `LinkButton`. |
| `IconButton` | `src/ui/controls/IconButton.tsx` | Includes the `IconLink`; uses `Tooltip`. |
| `TextField` | `src/ui/controls/TextField.tsx`, `src/ui/CommitInput.tsx` | Includes the `TextArea`; the `CommitInput` provides the `onCommit`. |
| `Select` | `src/ui/controls/Select.tsx` |  |
| `Choice` | `src/ui/controls/Choice.tsx` | Checkbox and radio. |
| `Segmented` | `src/ui/controls/Segmented.tsx` |  |
| `Tabs` | `src/ui/controls/Tabs.tsx`, `src/ui/BottomTabs.tsx` | `BottomTabs` is the use in the bottom window. |
| `Tooltip` | `src/ui/controls/Tooltip.tsx` |  |
| `HelpTip` | `src/ui/controls/HelpTip.tsx` | Uses `Tooltip` and the `info` icon; pattern "explanation = icon with a hint". |
| `Menu` | `src/ui/MenuPopover.tsx`, `src/ui/ActionMenu.tsx`, `src/ui/CanvasContextMenu.tsx`, `src/ui/CopyActions.tsx`, `src/ui/Popover.tsx` | Three menus in one guide; `Popover` is the positioning base. |
| `Dialog` | `src/ui/Dialog.tsx` |  |
| `ConfirmDialogs` | `src/app/EditorDialogs.tsx`, `src/app/useEditorDialogs.ts` | `ConfirmDialog` and `ExternalChangeDialog` live in `EditorDialogs.tsx`. |
| `Banner` | `src/ui/Banner.tsx`, `src/ui/PreviewBanner.tsx`, `src/ui/UpdateBanner.tsx` |  |
| `Notice` | `src/ui/Notice.tsx`, `src/ui/InstallHint.tsx` | The `InstallHint` uses the `Notice` (`info` tone, with `title` and `actions`); the paragraph `.notice` stays in the CSS. |
| `NoticeBadge` | `src/ui/NoticeBadge.tsx` | Badge, block and line for the four notice `kind`s of the specialization (`NoticeBadge`, `TypeNoticeBadge`, `NoticeBlock`, `NoticeLines`); color always with icon and text. |
| `Tags` | `src/ui/controls/Chip.tsx` | Layer tag in `src/ui/ListView.tsx`. |
| `Breadcrumbs` | `src/ui/Breadcrumbs.tsx` | Controls on the right of the bar in `src/app/EditorTools.tsx` and `src/ui/ZoomField.tsx`. |
| `StatusBar` | `src/ui/StatusBar.tsx` |  |
| `PerspectivePicker` | `src/ui/PerspectivePicker.tsx` | guide only, no preview |
| `PerspectiveDialogs` | `src/ui/NewPerspectiveDialog.tsx`, `ManagePerspectivesDialog.tsx`, `DeletePerspectiveDialog.tsx` | guide only, no preview |
| `PerspectivesSection` | `src/ui/PerspectivesSection.tsx`, `ArrivalNotice.tsx` | guide only, no preview |
| `ToolWindow` | `src/ui/ToolWindow.tsx` | Sizes in `src/ui/toolWindowLayout.ts`; assembly in `src/app/EditorWindows.tsx`. |
| `ToolStripButton` | `src/ui/ToolStrip.tsx` | It is the `StripButton`, not exported; metadata in `src/ui/toolWindowMeta.ts`. |
| `NarrowWindow` | `src/app/NarrowWindow.tsx` | Exports `NarrowWindowNotice` and `useNarrowWindow`; limit in `src/theme/breakpoints.ts`. |
| `Home` | `src/app/Home.tsx` | Rows of the recent projects in `src/app/recentRows.ts`. |
| `HelpDialog` | `src/ui/HelpDialog.tsx` | Shortcuts from `src/ui/shortcutList.ts`. |
| `Cover` | — | Cover of the DS; has no guide and no equivalent in the code. |

### Components: canvas, markings and details panels

| Component | Origin in the code | Notes |
| --- | --- | --- |
| `Arrow` | `src/canvas/renderers/arrows.ts`, `src/canvas/arrowGeometry.ts`, `src/canvas/renderers/overlay.ts` | Drawn in Konva; no `.tsx`. |
| `ArrowPanel` | `src/ui/ArrowPanel.tsx` |  |
| `CanvasMarking` | `src/canvas/renderers/markings.ts`, `src/canvas/renderers/overlay.ts`, `src/canvas/renderers/lockBadge.ts`, `src/canvas/renderers/review.ts`, `src/canvas/theme.ts` | Specification of the drawing in Konva, not a Preact component; geometry in `src/canvas/markingGeometry.ts`. |
| `Container` | `src/canvas/renderers/images.ts`, `src/canvas/renderers/overlay.ts`, `src/canvas/renderers/review.ts` | Drawn in Konva; no `.tsx`. |
| `ContainerDialog` | `src/ui/ContainerDialog.tsx`, `src/ui/containerForm.ts` |  |
| `ComponentDrawing` | `src/canvas/components/componentLayer.ts`, `src/canvas/components/renderScene.ts`, `src/canvas/components/screenRenderer.ts` | Drawn in Konva; `image` node via `imageLoader.ts` and `remoteImages.ts`. |
| `Minimap` | `src/ui/Minimap.tsx`, `src/canvas/minimap.ts` | DOM, not Konva; layout computations in the canvas. |
| `ZoomField` | `src/ui/ZoomField.tsx` | Used in `src/ui/StatusBar.tsx` and `src/ui/Breadcrumbs.tsx`. |
| `ViewModePanel` | `src/ui/ViewModePanel.tsx` | "Mostrar no canvas" panel of view mode and the button that reopens it; the **Visualizar** button (`ViewModeButton`) lives in `src/app/EditorTools.tsx`. The mode item in the status bar is `ViewModeItem`, in `src/ui/StatusBar.tsx` (`StatusBar` guide). |
| `MarkingPanel` | `src/ui/MarkingPanel.tsx` |  |
| `MarkingPicker` | `src/ui/MarkingPicker.tsx` |  |
| `MultiSelectionPanel` | `src/ui/MultiSelectionPanel.tsx` |  |
| `LayerGroup` | `src/ui/AnnotationsPanel.tsx`, `src/ui/LayersPanel.tsx` | `LayerGroup` is an internal function of `AnnotationsPanel.tsx`; the guide also covers the layer list (`LayersPanel`, window in `LayersWindow.tsx`). |
| `TreeRow` | `src/ui/MarkingTree.tsx` | Row of the Tree; window in `src/ui/TreeWindow.tsx`. |
| `KeyValueGrid` | `src/ui/KeyValueGrid.tsx` |  |
| `PropertyGrid` | `src/ui/PropertyGrid.tsx` |  |
| `DataGrid` | `src/ui/TableField.tsx`, `src/ui/ListView.tsx` | Two uses under one name: the `table` field of Details and the List as a table. `LayerCell` and `MarkingCell` (button of the first column) are exported from `ListView.tsx` and also used by `IncompleteView.tsx` and `NoticesView.tsx`. |
| `RefCell` | `src/ui/RefCell.tsx`, `src/ui/RefPicker.tsx` | Picker in `compact` mode. |
| `ReferenceField` | `src/ui/TypedFields.tsx`, `src/ui/RefPicker.tsx` | `RefField` is an internal function of `TypedFields.tsx`. |
| `InconsistentProjectDialog` | `src/ui/InconsistentProjectDialog.tsx` | Opened by `src/app/Home.tsx`. |

### Components: review, proposals, catalog and settings

| Component | Origin in the code | Notes |
| --- | --- | --- |
| `ChangeBelow` | `src/ui/review/ChangeBelow.tsx` |  |
| `ChangeKind` | `src/ui/review/ChangeKind.tsx` |  |
| `ChangeMark` | `src/ui/review/ChangeMark.tsx` |  |
| `ChangePopover` | `src/ui/review/ChangePopover.tsx` |  |
| `DecisionControl` | `src/ui/review/DecisionControl.tsx` | Also exports `REVIEW_KEYS` (shortcuts A, R, Backspace). |
| `DecisionMark` | `src/ui/review/DecisionMark.tsx` |  |
| `DiffValue` | `src/ui/review/DiffValue.tsx` |  |
| `Flag` | `src/ui/review/Flag.tsx` |  |
| `ImageCompare` | `src/ui/review/ImageCompare.tsx` | Opened by `CompareDialog` in `src/ui/review/ReviewCanvasControls.tsx`. |
| `NoteField` | `src/ui/review/NoteField.tsx` |  |
| `OtherChanges` | `src/ui/review/OtherChanges.tsx` | Exports `OtherChangesSection`, `OtherChangeRow` and `ImagesSection`. |
| `ProposalRow` | `src/ui/review/ProposalRow.tsx` | Used in `ProposalList.tsx`; also exports `DecisionCounts`. |
| `ReviewBar` | `src/ui/review/ReviewBar.tsx` |  |
| `ReviewHeader` | `src/ui/review/ReviewHeader.tsx` | Also exports `IdentityFlags`. |
| `ReviewRow` | `src/ui/review/ReviewRow.tsx` | Used in `ReviewLevels.tsx`; the guide and the preview also cover the collapsed filter row and the open panel. |
| `UpdateImpact` | `src/ui/UpdateImpact.tsx` |  |
| `CatalogPage` | `src/ui/catalog/CatalogPage.tsx` | Also `CatalogView.tsx`, `Playground.tsx`, `renderer.ts` and `src/ui/markdown/Markdown.tsx`. |
| `CatalogScreen` | `src/app/CatalogScreen.tsx` | Uses `src/store/libraryPreview.ts`. |
| `CatalogWindow` | `src/ui/CatalogWindow.tsx` | Also `LibraryPalette.tsx` and `useAddComponent.ts`. |
| `CodeDefinitions` | `src/ui/CodeDefinitions.tsx` | Resolves the variant by `typeCodeDefinitions` (`src/model/codeVariants.ts`). |
| `SpecsDialog` | `src/ui/SpecsDialog.tsx` | Also `specPackageImport.ts`. |
| `LibraryIssueList` | `src/ui/LibraryIssueList.tsx` |  |
| `NoticesView` | `src/ui/NoticesView.tsx`, `src/ui/BottomTabs.tsx` | Notices window (`Ctrl+Shift+8`): filters, groups by notice and the tab with a count. |
| Janela Comentários | `src/ui/toolWindowMeta.ts`, `src/store/toolWindows.ts` | Tab of the bottom window, the last one (`WINDOW_NUMBER.comments = 0`, shortcut `Ctrl+Shift+0`, icon `chat`). |
| `SettingsDialog` | `src/ui/SettingsDialog.tsx` | Also `SettingsBar.tsx`, `PlatformRepos.tsx` and `PrivacySettings.tsx`. |

### Components: conversations and comments

| Component | Origin in the code | Notes |
| --- | --- | --- |
| `CommentPin` | `src/canvas/commentPins.ts`, `src/canvas/renderers/commentPins.ts`, `src/canvas/theme.ts` | Pin drawn in Konva; no `.tsx`; guide only, no preview. |
| `CitationChip` | `src/ui/comments/CitationChip.tsx`, `CitationEditor.tsx`, `CitePicker.tsx` | Guide only, no preview. |
| `ThreadMessage` | `src/ui/comments/ThreadMessage.tsx`, `ThreadView.tsx` | Guide only, no preview. |
| `ThreadsSection` | `src/ui/comments/ThreadsSection.tsx` | Conversations section of Details; guide only, no preview. |
| `Composer` | `src/ui/comments/Composer.tsx` | Guide only, no preview. |
| `CommentsWindow` | `src/ui/comments/CommentsWindow.tsx`, `StandaloneThreadPanel.tsx` | Content of the Comments window (the tab is in "Janela Comentários", above); guide only, no preview. |
| `ProposalCard` | `src/ui/comments/ProposalCard.tsx` | Guide only, no preview. |
| `DeleteThreadDialogs` | `src/ui/comments/useDeleteThread.tsx`, `BulkDeleteDialog.tsx`, `deleteText.ts` | Guide only, no preview. |
| `ReferencedByRow` | `src/ui/ReferencedBy.tsx` | "Referenciada por" row of the `AnnotationEditor`; guide only, no preview. |

### Sections

| Section | Origin | Status |
| --- | --- | --- |
| `README.md` | the brand book; no single origin in the code | Authored. |
| `Atalhos.md` | `src/app/shortcuts.ts`, `src/app/useEditorShortcuts.ts`, `src/ui/shortcutList.ts`, `src/ui/review/DecisionControl.tsx`, `src/store/toolWindows.ts` | Up to date. |
| `Canvas.md` | `src/canvas/theme.ts`, `src/canvas/renderers/`, `src/canvas/reviewMarks.ts`, `src/canvas/viewport.ts`, `src/canvas/input/`, `src/canvas/components/` | Up to date since 2026-11-02 (ghost in both views, created component, `image` node). |
| `Conceitos.md` | `docs/FORMAT.md` (schema v13), `src/model/` (`hierarchySettle.ts`, `arrows.ts`, `locks.ts`, `componentDrawings.ts`), `docs/PROPOSAL-FORMAT.md` | Up to date. |
| `Contraste.md` | `src/theme/tokens.ts`, `tests/theme/` (`contrast`, `tokens`, `tokenLiterals`, `canvasLiterals`) | Values up to date; the ratios were not recalculated. |
| `Layouts.md` | `src/app/Editor*.tsx`, `src/app/Home.tsx`, `src/app/NarrowWindow.tsx`, `src/ui/toolWindowLayout.ts`, `src/ui/ToolWindow.tsx`, `src/theme/` | Up to date in the measurements. |
| `Revisao.md` | `src/ui/review/`, `src/canvas/reviewMarks.ts`, `src/canvas/renderers/review.ts`, `src/store/proposedCatalog.ts`, `src/store/review.ts` | Up to date since 2026-11-02. |

### Tokens

Single source: `src/theme/tokens.ts` (light and dark theme). The canvas reads the tokens through `src/canvas/theme.ts`. The DS keeps the same list in `project/tokens.json`.

Checked on 2026-11-02 by name and by value, in both themes: no DS token is missing from the code, and **no value diverged**. Seven color tokens differ only in the alias notation (`{x}` in the DS, `var(--x)` in the code) and resolve to the same value.

On the same date the seven that were missing entered the DS: `size-grid-col-min` (`96px`) and the roles `control-height`, `control-height-sm`, `control-icon`, `control-check`, `row-height` (`size` family) and `control-radius` (`radius` family). The roles matter because `CLAUDE.md` tells the CSS to use only the `--control-*` ones, not the raw tokens; since the format only accepts aliases in color, each role entered with the literal value and the `usage` says which token it represents.

| Family                               | In the DS | In the code      |
| ------------------------------------ | --------- | ---------------- |
| `color` (includes `cv-*`, `layer-*`) | 72        | 72               |
| `type` (`t-*` styles)                | 12        | 12 (+ 5 aliases) |
| `spacing`                            | 9         | 9                |
| `radius`                             | 7         | 7                |
| `shadow`                             | 1         | 1                |
| `size`                               | 61        | 56 (+ 5 roles)   |
| `opacity`                            | 11        | 11               |
| `duration`                           | 6         | 6                |
| `zIndex`                             | 8         | 8                |
| `breakpoint`                         | 2         | 2                |

Count checked on 2026-11-10 (DS3, `tokens.json` of the artifact at version 69 against `src/theme/tokens.ts`, name and value in both themes): 177 tokens in the lists, 21 of them entered in DS3 (the six `color-thread-*`, `cv-component-unknown-fill`, `opacity-slot`, the eleven `size-cv-pin-*` and `size-cv-arrival-*` and the two `size-minimap-*`; `size-tw-bottom` became `360px`). The five `size` roles (`control-height`, `control-height-sm`, `control-icon`, `control-check`, `row-height`) are aliases in the code and literal values in the DS. The old divergence of `size-review-col-name-min` (194px in the code, 208px in the DS) was fixed in DS5 (version 71): the DS went to 194px.

Only the five text aliases `t-text`, `t-text-small`, `t-text-heading`, `t-text-title` and `t-text-input` are missing from the DS, because of a format limit (see Pending items).

### Icons

Single source: `src/ui/icons.tsx` (inline SVG, 16 px grid, 1.25 stroke, `currentColor`). The DS keeps each icon as an upload in the `Icons` group.

Checked on 2026-11-10 (DS3): **92 icons in the DS, 92 in `icons.tsx`**, with the two new `thread-awaiting-human` and `thread-awaiting-agent` (keys `threadAwaitingHuman` and `threadAwaitingAgent`). Before that, on 2026-11-04: **86 icons in the DS, 86 in `icons.tsx`, 1:1 correspondence**, with no leftover on either side (the 86th is `container-mark`, key `containerMark`, right after `container`). The only difference is the naming convention — the DS uses the file name in kebab-case (`zoom-in.svg`), the code uses the key in camelCase (`zoomIn`). When adding an icon, keep both names matching.

## With a visible shape and no DS component

Surveyed on 2026-11-02. These files appear on screen and no DS guide covers them. **They are not pending items:** whether they enter the DS is the owner's decision, and creating a new component is outside the scope of the sync stage.

- Dialogs: `src/ui/review/ExitReviewDialog.tsx`, `src/app/ExportDialog.tsx`, `src/ui/SpecsDialog.tsx`, `src/ui/InconsistentProjectDialog.tsx` (the last three only cited in the `Dialog` guide), `src/ui/LinkDialog.tsx`, `src/ui/TypePicker.tsx`.
- Bars and strips: `src/app/EditorMainBar.tsx`, `src/app/EditorTools.tsx`, `src/ui/SettingsBar.tsx`, `src/ui/ImageConsentBanner.tsx`, `src/ui/InstallHint.tsx`, `src/ui/review/ProposalNotices.tsx`.
- Review: `src/ui/review/ReviewLevels.tsx` (the progress bar; the collapsed filters and the open panel are in the `ReviewRow` guide and preview), `src/ui/review/ProposalList.tsx` (the search and the empty state), `src/ui/review/ReviewCanvasControls.tsx` (the Atual/Proposto toggle and the legend of the marks), `src/ui/review/RevisedBefore.tsx` (the "Antes da revisão" block).
- Details and fields: `src/ui/FieldEditors.tsx`, `src/ui/CommitInput.tsx`, `src/ui/AnnotationEditor.tsx`, `src/ui/AnnotationSummary.tsx`, `src/ui/DetailsSection.tsx`, `src/ui/DetailsIdentity.tsx`, `src/ui/MarkingColorField.tsx`, `src/ui/OwnerRoleField.tsx`, `src/ui/LinkedAnnotations.tsx`, `src/ui/IdentitySettings.tsx`.
- Settings: `src/ui/PrivacySettings.tsx`, `src/ui/PlatformRepos.tsx`.
- Others: `src/ui/Popover.tsx`, `src/ui/LibraryPalette.tsx`, `src/ui/DiagnosticsView.tsx`, `src/ui/IncompleteView.tsx`, `src/ui/LayersWindow.tsx`, `src/ui/TreeWindow.tsx`, `src/ui/comments/CitePicker.tsx`, `src/ui/comments/StandaloneThreadPanel.tsx`, `src/ui/comments/CitedIn.tsx`.

Compositions and logic with no shape of their own (they do not need a component): `src/ui/SelectionPanel.tsx`, `src/ui/review/ReviewPanel.tsx`, `ReviewDetails.tsx`, `ProposalsWindow.tsx`, `reviewExtension.tsx`, `changeText.ts`, `levelRows.ts`, `src/canvas/reviewMarks.ts`, `src/store/proposedCatalog.ts`, `src/canvas/frame.ts`, `containment.ts`, `gestureMachine.ts`, `input/`, `viewportController.ts`.

## Loose buttons

Owner decision of 2026-11-08 (stage #954, item 38): the `<button>` of a **common action** comes from `src/ui/controls/` (`Button`, `IconButton`); the one with a **role of its own** stays as it is, with the comment `Exceção ao Button: <papel>` in the code (a test checks the files below). No new control and no visual change. These are the exceptions of the item 38 files:

| File | Button | Role |
| --- | --- | --- |
| `src/ui/StatusBar.tsx` | "Tentar novamente" of the write error | text link in the message (`.link`) |
| `src/ui/StatusBar.tsx` | new proposals, notices and open conversations | status bar segment (`.status-item-button`) |
| `src/ui/ReferencedBy.tsx` | each origin of "Referenciada por" | text link (`.link-button`) |
| `src/ui/PerspectivePicker.tsx` | list row | list option (`role="option"`) |
| `src/ui/PerspectivePicker.tsx` | perspective trigger | select look (`.menu-trigger`) |
| `src/ui/ZoomField.tsx` | zoom field | shows the value and goes back to 100% |
| `src/ui/TypedFields.tsx`, `src/ui/RefCell.tsx` | `ref` field and cell | reference field with a select look (`.ref-control`) |
| `src/ui/TypedForm.tsx`, `src/ui/TableField.tsx` | disabled `ref` field (type form and table column without a picker) | the same `.ref-control` |
| `src/ui/TableField.tsx` | row handle | drag handle (`.grid-grip`) |
| `src/ui/catalog/CatalogView.tsx` | type in the list | list option (`.catalog-entry`) |
| `src/ui/review/ChangeMark.tsx` | change marker | opens the change popover and carries the shortcuts A, R and Backspace (`.change-mark`) |
| `src/ui/review/ReviewBar.tsx` | "N conjuntos inválidos" | clickable problem badge (`.flag.flag-danger`) |
| `src/app/Home.tsx` | side strip items ("Projetos", "Ajuda", "Configurações") | navigation item, with `aria-current="page"` on the current one (`.home-nav-item`) |

## Pending items

What the code already has and the DS does not describe yet and that **does not belong to a particular epic**. Each epic's pending items live in `docs/design-system/<name>.md` (see "When to update").

### Previews do not show the new state

The sync of 2026-11-02 fixed the guides of all the affected components, but only added the new state to the preview of six of them (scope decision of the owner). The previews of the following still show the old state:

- `ChangeMark`, `ChangePopover`, `ReviewBar`, `ReviewHeader`, `OtherChanges`: the Proposed view draws the created components and the rejected creation becomes a ghost in both views. In many of them the change is canvas behavior, which the preview does not draw — check case by case whether it is worth touching.
- `PropertyGrid`, `KeyValueGrid`, `DataGrid`, `ReferenceField`: the suggested vocabulary of the `string` field (the `TextField` preview already shows it).
- `Breadcrumbs`: the hint (`title`) on the truncated name (the `LayerGroup` preview already shows the truncated badge with the hint, since `epic/selo-nomes-acessiveis`).

### Classes missing from `bundle.css`

The previews of `TextField`, `SettingsDialog`, `CatalogPage` and `Home` declare in their own `<style>` classes that the app has and the DS's `bundle.css` does not: `.suggestions`, `.suggestion`, `.suggestion-label`, `.suggestion-detail` (in the app, in `src/theme/editor.css`), `.privacy-*` (in `src/theme/layout.css`), `.catalog-variants-caption` and the `white-space: nowrap` of `.project-actions .button` and `.project-table .badge` (in `src/theme/layout.css`, since `epic/acabamento-900`). Since `epic/papeis-e-docs-externos`, `.external-doc`, `.external-doc-actions`, `.external-doc-link`, `.external-doc-path` (in `src/theme/catalog.css`), `.repos-group` and `.repos-subtitle` (in `src/theme/layout.css`) have been added, declared in the `CatalogPage` and `SettingsDialog` previews; and, only described in the guides, `.type-search`, `.type-section`, `.type-group-title` and `.linked-role-*`. It works, but the right thing is for the bundle to gain these classes when it is regenerated, and for the previews to stop declaring them.

### Text aliases outside `tokens.json`

The five text roles of the code did not enter the DS: the format's `type` family only accepts `fonts`, `families` and `groups.styles`, with real font values, and has nowhere to keep a style alias. Recording them as duplicate styles would pollute the Typography. The correspondence, from `src/theme/tokens.ts`:

| Role             | Points to   |
| ---------------- | ----------- |
| `t-text`         | `t-body`    |
| `t-text-small`   | `t-small`   |
| `t-text-heading` | `t-heading` |
| `t-text-title`   | `t-title`   |
| `t-text-input`   | `t-body`    |

### To check

- **Extra `}` in the preview `<style>`.** Found and fixed in `MultiSelectionPanel` and `CodeDefinitions`, in both at the end of the hover rules block, which looks copied between previews. The other previews were not swept: a pass checking brace balance in all of them is worthwhile. The check of the write of `epic/selo-nomes-acessiveis` (2026-11-04) found the same extra `}`, already existing, also in the previews of `LayerGroup`, `TreeRow`, `MarkingPanel`, `ArrowPanel`, `RefCell` and `ReferenceField`; it was not fixed.
- **Visual cleanup (write of 2026-11-04).** `Notice`: the `.notice .notice-info` example of the preview still uses the text of the arrow lock notice ("Trancada: a rota, as pontas..."), which the app no longer shows as a paragraph (it became a `HelpTip`); `.notice-info` is still in use in the app (`CanvasNotices`, pickers, `InstallHint`, `AnnotationEditor`). There is no preview of the locked image (container) panel: the `SelectionPanel` has no component in the DS ("Compositions and logic with no shape of their own"); the state was described in the `MarkingPanel` guide. In the `CatalogWindow` preview, a selector `.ds-state-hover .tab:not(:disabled{...}` is missing the closing parenthesis (it is not known whether it was already like that). The previews of `ArrowPanel`, `MarkingPanel`, `PropertyGrid`, `LayerGroup` and `ReferenceField` have repeated ids (`P0-0`, `P0-1`...), coming from the app's rendered preview with several states; the `HelpTip` ids are unique. It was not proven, without a copy of version 26, that the authors' text was preserved byte for byte outside the visual cleanup passages.
- **Card height.** The `height=` of the six previews changed on 2026-11-02 were estimated, not seen in a browser: `TextField` 710 → 1010, `SettingsDialog` 2800 → 6000, `CodeDefinitions` 230 → 640, `CatalogPage` 1800 → 2300, `MultiSelectionPanel` 662 → 860, `ComponentDrawing` 620 (no change). Check whether any card is cut off.
- **Contrast.** The changed previews were not seen in a browser in both themes; the new text uses the existing tokens, but the visual check was not done.
- `ReviewHeader`: the guide describes "Aceitar remoção" and "+ N anotações criadas"; the behavior was not confirmed line by line against `ReviewHeader.tsx`.
- `Contraste.md`: the contrast ratios were not recalculated, only the token values.
- `Notice`: the guide says `.notice-error` and `.notice-success` have no use in the app; not checked in the CSS.
- `TextField`: the `StringEditor` now strips the trailing line break from the text when writing (`src/ui/FieldEditors.tsx`, from `epic/exemplos-enxutos`). The guide describes the `onCommit` and does not mention this; decide whether it deserves a line.
- `Revogar` an origin: the `SettingsDialog` guide says the next use asks for consent again. `revokeOrigin` only removes the origin from the list, and the rest is inference — confirm against `src/store/imagePermissions.ts`.

## Sync history

One file per epic in [`docs/design-system/`](design-system/), with what the closing wrote to the artifact (or "Sem impacto") and what was left unwritten. `ls docs/design-system/` comes out in chronological order, with the unreleased ones (`<name>.md`, no date) at the end; epics of the same day are in alphabetical order, and the exact merge order is that of `git log --first-parent main`. The first line of each file is `# <Stage> — <YYYY-MM-DD | [Não lançado]> (épico \`epic/<name>\`)`, and the sections are only `## Pendências`, `## Sincronização`and`## Ficou sem gravar`. Open pending items are found with `grep -rn -A99 '^## Ficou sem gravar' docs/design-system/`.

Each item of `## Ficou sem gravar` carries `Motivo:` (what prevented the write, concrete) or "Passou para o registro do épico `epic/<name>`: <summary>", when another epic started writing it; that epic's record must exist in the folder.
