# Finish and guide — 2026-11-06 (épico `epic/acabamento-e-guia`)

## Pendências

- **Annotation header (`AnnotationEditor`):** the **Copy reference** and trash buttons move into a group (`.annotation-header-actions`, no box where everything fits). With no room for the name field with the full placeholder, the header gets the `is-split` class (measured by `useSplitHeader`): the 1st row keeps arrow, type, help, badges, marks and the button group on the right; the name field drops entirely to the 2nd row (`flex: 1 1 100%`). Tokens only (`--space-1`, `--size-grid-col-min`). Files: `src/theme/panels.css` (`.annotation-header-actions`, `.is-split`), `src/ui/AnnotationEditor.tsx`, `src/ui/useSplitHeader.ts`. Update `AnnotationEditor` in the artifact with a narrow panel variant (two rows).
- **Layer header (`LayerGroup`):** the specialization badge yields almost all the space before the name (`flex: 0 1000 auto`, before `0 100 auto`), so the name only gets an ellipsis after the badge disappears. File: `src/theme/details.css` (`.layer-group-head .tag`).
- **`Menu`:** the `--space-4` `gap` left the menu button (back to the `.button`'s `--space-1-5`); only the entry with a shortcut (`.button:has(> .menu-shortcut)`) gets `--space-4`. File: `src/theme/editor.css` (`.menu-items .button`). Update `Menu` in the artifact.
- **Marks legend (review):** now comes after the minimap in the DOM (same `--z-canvas-overlay`), so it sits on top of it. File: `src/app/Editor.tsx`. No token or style change; adjust the order in the review canvas preview.
- **Removed marking in review (struck-through name):** the strike is no longer Konva's `line-through` (which used the text color, `--cv-line`, with `fontSize/15`, and disappeared over it) and becomes its own stroke: a `--cv-line` line of 1.5 px with a `--cv-halo` halo of 1 px on each side, at 55% of the text height and the same width as the text; on the **selected** removed marking, the name label (`--cv-name-tag`) gets the strike too, in its text color (`--cv-name-tag-text`, 1.5 px). No new token. Files: `src/canvas/renderers/review.ts`, `src/canvas/renderers/overlay.ts`, `src/canvas/renderers/metrics.ts` (`STRIKE_WIDTH`, `STRIKE_HEIGHT`). Update the drawing of the removed marking in the review canvas preview (struck-through name, normal and selected).
- **"Open in a larger window" notice (`NarrowWindowNotice`) and new token:** the minimum window goes from 900 to **900×860**: new token `size-app-min-height` (860px, next to `size-app-min`) and the notice applies below 900 wide **or** 860 tall; the text now mentions both numbers ("Mapping needs a window of at least 900 × 860 px…"). Reason: the review marks legend only fits in full with a 374 px canvas, which needs a window of ~858 px. Files: `src/theme/breakpoints.ts` (`appMinHeight`, `NARROW_QUERY`), `src/theme/tokens.ts`, `src/app/NarrowWindow.tsx`, `src/i18n/`. Register the token in the artifact and update the notice text and the 900×860 minimum in the desktop mockups.

## Sincronização

Gravado no artefato **Mapping** on 2026-11-06: version 41 (content) and version 42 (index, only with the `lastChange`).

- **`AnnotationEditor` (annotation header):** the DS has no component of its own; the header lives in `LayerGroup`. `bundle.css` gained `.annotation-header-actions` and `.annotation-header.is-split`, identical to `src/theme/panels.css`; the `LayerGroup` guide describes the button group and the two rows, and the preview gained the card "Annotation header: one row or two" (`height` from 1880 to 2080).
- **`LayerGroup` (specialization badge):** `.layer-group-head .tag` became `flex: 0 1000 auto` in `bundle.css`, and the guide says the name only shrinks after the badge disappears.
- **`Menu`:** the `space-4` `gap` left `.menu-items .button` and only the entry with a shortcut (`:has(> .menu-shortcut)`) gets it, in `bundle.css`; the guide was corrected.
- **Marks legend (review):** the `Minimap` guide and `Layouts.md` say the legend sits on top of the minimap; the `Minimap` preview gained a card with the full legend over the minimap on a 374 px canvas (`height` from 350 to 800). No DS preview drew the legend, so the card is new.
- **`CanvasMarking` (struck-through name of the removed one):** the "Removed" card went from `line-through` to its own strike (1.5 px `--cv-line`, `--cv-halo` halo) and gained the "Removed and selected" card (label with the struck-through name, `--cv-name-tag-text`); `height` from 1550 to 1680. The guide and `Canvas.md` describe the strike (`STRIKE_WIDTH`, `STRIKE_HEIGHT`).
- **Minimum window 900×860:** `tokens.json` gained `size-app-min-height` (860px, right after `size-app-min`, which mentions the height in `usage`); the `NarrowWindow` guide and preview, `Layouts.md` and `README.md` mention 900×860, and the guide and the preview carry the notice's new text.
- **Contrast:** no impact (no new color; only existing tokens).

## Ficou sem gravar

Nothing. Only the visual check remains, because no preview was opened in the DS viewer:

- Passou para o registro do épico `epic/sincronia-ds-2`: Check of the "Removed" card of `CanvasMarking` (estimated width of the SVG strike).
- Passou para o registro do épico `epic/sincronia-ds-2`: Check of the "Removed and selected" card of `CanvasMarking` (height of the strike on the label).
- Passou para o registro do épico `epic/sincronia-ds-2`: Check of the new `LayerGroup` cards (`is-split`), in both themes and with the card height.
- Passou para o registro do épico `epic/sincronia-ds-2`: Check of the new `Minimap` card (legend over the minimap) and of the card height.
