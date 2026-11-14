# Fit the selection and the Card that moved in R25 — 2026-11-08 (épico `epic/enquadrar-selecao`)

## Pendências

- **`Breadcrumbs` (controls on the right of the canvas bar):** new **Fit selection** button (`FitSelectionButton`, `IconButton` with the `fit-selection` icon), right after **Fit all**; label "Fit selection", tip with the `Shift+2` shortcut, disabled without a selection and in view mode. Only tokens. Files: `src/app/EditorTools.tsx`, `src/app/EditorWindows.tsx`. Show the button (enabled and disabled) next to **Fit all** in the canvas controls preview.
- **Icons:** `fit-selection` new in `src/ui/icons.tsx`, in the stroke of `fit` (four corners) with a small square in the center. Add to the artifact's icon set.
- **`Atalhos.md` / `HelpDialog`:** new row in the **Zoom** group, "Fit the selection", `Shift+2` (`src/ui/shortcutList.ts`).

## Sincronização

Gravado no artefato Mapping do Claude Design on 2026-11-08 (index `project/design-system.json`, version 62, `lastChange` by Claude via claude):

- **`fit-selection` icon:** new asset `fit-selection.svg` (the `fit` with the central square), in the `Icons` group of the index, right after `fit.svg`; `project/assets/Icons/README.md` now says 90 icons and mentions the new one.
- **`Breadcrumbs`:** **Fit selection** button right after **Fit all** in the preview (enabled with a selection, disabled in view mode, `aria-keyshortcuts="Shift+2"`) and in the component's `README.md` (`FitSelectionButton` in "In the code").
- **`Atalhos.md`:** row "Fit the selection | Shift+2" in the table of the "View" group (the app calls it "Zoom"); **`HelpDialog`:** the same row in the preview.

Only tokens and classes that already existed; the previews were not rendered in the browser.

## Ficou sem gravar

Nothing. (I did not check the contrast of the previews in the light and dark themes: the button and the icon use only tokens and `currentColor`.)
