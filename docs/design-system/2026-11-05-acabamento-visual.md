# Visual finish — 2026-11-05 (épico `epic/acabamento-visual`)

## Pendências

- **`Menu` (entry with shortcut):** the `kbd.menu-shortcut` goes to the right of the entry (`margin-inline-start: auto`); the minimum space between label and shortcut becomes the button's `gap` (`--space-4`). Before, a higher-specificity rule zeroed the `auto` and the shortcut stuck to the label. Tokens only. File: `src/theme/editor.css` (`.menu-items .button`, `.menu-items .menu-shortcut`). Update the `Menu` entry with a shortcut in the artifact.
- **`Tooltip` (`end` placement):** new `placement="end"` placement: the tip opens to the right of the control, vertically centered, and flips to the left if it does not fit; `IconButton` gains `tooltipPlacement`. All buttons in the side strip use `end`. Files: `src/ui/controls/Tooltip.tsx`, `src/ui/controls/IconButton.tsx`, `src/ui/ToolStrip.tsx`. Document the placement in `Tooltip` and the side strip tip in the artifact.
- **Position and Size fields in Details (`.props-pair`):** with the value column narrow (container query `props-pair`, up to 170 px), X, Y, W and H swap the side padding (`--space-1`) and the spinner for digits, to fit 5 digits; Position and Size stay on two rows (X and Y; W and H). At wider widths nothing changes. File: `src/theme/details.css`. Show the narrow panel in the `MarkingPanel` preview.
- **Layer header (`Flag` and badge):** the hidden layer's flag does not shrink (`flex: none`); the badge shrinks first (`flex: 0 100 auto`), then the name (`flex: 0 1 auto`, with `title`). Files: `src/theme/details.css` (`.layer-group-name`, `.layer-group-head .tag`, `.layer-group-head .flag`), `src/ui/AnnotationsPanel.tsx`. Update `LayerGroup` and `Flag` in the artifact.
- **Canvas — selection rectangle (`cv-select`, contrast note):** the Shift+drag rectangle gets the `cv-halo` halo under the border (stroke of `2 + 2·1` screen px, same dashing, no fill), like the selection and the draft. Contrast measured with the function in `tests/theme/contrast.test.ts` (no new token): light theme, `cv-select` border over the canvas 2.58:1 (below 3) and composite halo over the canvas 7.24:1, so it is the halo that separates the rectangle; dark theme, border over the canvas 6.08:1. The silhouette passes 3:1 in both themes. Files: `src/canvas/renderers/overlay.ts` (`renderMarquee`), `tests/theme/contrast.test.ts`. Update `Canvas.md` (selection rectangle) and the `Contraste.md` note on `cv-select`.
- **Canvas — layers:** the stage goes from six to five Konva layers: arrows and markings share one (one group for each, the draw order is the same). No visual effect; it only shows if `Canvas.md` describes the layers. File: `src/canvas/CanvasController.ts`.
- **Annotation card header (`AnnotationEditor`/`MarkingPanel`):** `.annotation-header` now wraps (`flex-wrap: wrap`) and `.annotation-name` has a basis of `--size-grid-col-min` (`flex: 1 1`); with a narrow panel and the **Copy reference** button (only with a folder), the name field drops to the next row instead of being squeezed and overflowing the width. Tokens only. File: `src/theme/panels.css`. Show the annotation card in the narrow panel in the `MarkingPanel` preview.

## Sincronização

Gravado no artefato **Mapping** on 2026-11-05: version 37 (content) and version 38 (index, only with the `lastChange`).

- **`bundle.css`:** mirrors `editor.css` (`Menu` shortcut on the right, `gap` of `space-4`), `details.css` (container query `props-pair`; layer header: name `0 1`, badge `0 100`, `Flag` `none`) and `panels.css` (`.annotation-header` with `flex-wrap`, `.annotation-name` with a `size-grid-col-min` basis). The `end` placement of `Tooltip` has no CSS: it is computed in JS.
- **Guides:** `Menu`, `Tooltip` (`end`), `IconButton` (`tooltipPlacement`), `ToolStripButton` (tip on the side), `MarkingPanel` (narrow panel), `LayerGroup` (name > flag > badge and annotation card header) and `Flag`; `Canvas.md` (selection rectangle halo; arrows and markings share one Konva layer) and `Contraste.md` (composite halo 7.24:1 in light; border 2.58:1 in light and 6.08:1 in dark).
- **Previews:** `Tooltip` (`end` example, `height` from 215 to 310), `MarkingPanel` (280 px narrow panel card, with 5 digits and the annotation header wrapping) and `LayerGroup` (`Flag` label).
- **Tokens and contrast:** no new token; `tokens.json` did not change. The tester measured 7.26:1 for the halo in the capture; the 7.24:1 is from the exact composite.
- **App pending items that the write revealed:** the `gap` of `space-4` in menus also widens the space between icon and label, and the layer header name loses fractions of a pixel before the badge disappears (issue #545). The DS mirrors the app as it is.

## Ficou sem gravar

Nothing was left unwritten. Only the visual check in the DS viewer remains:

- Passou para o registro do épico `epic/sincronia-ds-2`: Check of the `Tooltip` preview (`end` example, card height) in both themes.
- Passou para o registro do épico `epic/sincronia-ds-2`: Check of the `MarkingPanel` preview (280 px narrow panel card) in both themes.
- Passou para o registro do épico `epic/sincronia-ds-2`: Check of the `LayerGroup` preview (narrow headers) in both themes.
- Passou para o registro do épico `epic/sincronia-ds-2`: Check of the `Menu` preview (entry with shortcut), which was only seen in the light theme.
- Passou para o registro do épico `epic/sincronia-ds-2`: `ToolStripButton` preview with `tooltip-bottom` in the static HTML: no visual effect, not a pending item.
