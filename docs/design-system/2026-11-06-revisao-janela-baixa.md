# Review in short windows — 2026-11-06 (épico `epic/revisao-janela-baixa`)

## Pendências

- **Review filters (`ReviewLevels`, `ReviewFilters`):** the filters become a single row with the **Filters** button (`Button` `sm`, `filter` icon, `aria-haspopup="dialog"` and `aria-expanded`); with an active filter the label is "Filters · N" (N = active groups among decision, types, image, layer and Conflicts only) and next to it sit the "N of M" and **Clear filters**. The previous controls (decision, type chips, image, layer, Conflicts only) go in a `Popover` (`role="dialog"`, name "Review filters", class `review-filters-panel`: column, `--space-2` gap, `--space-3` padding, maximum width of 20 × `--space-6`). Choosing does not close the panel. New texts: `review.filtersButton` and `review.filtersButtonCount`. Files: `src/ui/review/ReviewLevels.tsx`, `src/theme/review.css` (`.review-filters`, `.review-filters-panel`), `src/i18n/review.ts`. Update `ReviewLevels` in the artifact (guide and preview: collapsed filters row, and the open state of the popover).
- **Token `size-tw-bottom-review`:** from 344px to **240px** (3 list rows of 28 px, the header, the collapsed filters and the shortcuts footer at 900 px wide). File: `src/theme/tokens.ts`. Update the value in `tokens.json` and the height of the review bottom window in the mockups.
- **Marking legend (review):** stops being `position: absolute` inside the canvas and becomes `position: fixed`, anchored to the top-left corner of the canvas, with its width limited to its column and its height up to the top of the status bar; it may cover the Proposals window and the minimap. Layer: `--z-popover` (above the windows, below `--z-tooltip`). The measurements arrive through CSS variables (`--legend-top`, `--legend-left`, `--legend-width`, `--legend-room`) written by `ReviewLegend`. No new token. Files: `src/ui/review/ReviewCanvasControls.tsx`, `src/theme/review.css` (`.review-legend`). Update the `Minimap` guide and preview (the legend covering the bottom window when the canvas is short).

- **Minimum window (`size-app-min-height`) and the "Open in a larger window" notice:** the token goes from 860px to **720px** (`src/theme/tokens.ts`, coming from `BREAKPOINTS.appMinHeight`); the notice (`NarrowWindowNotice`, text `narrow.body`) reads the value and now says "900 × 720". Update the value in `tokens.json` and the number in the notice preview.

## Sincronização

Gravado no artefato **Mapping** on 2026-11-06, at the close of the epic (version `1793937636-5db9`; the index last, with `lastChange`):

- `project/tokens.json`: `size-tw-bottom-review` from 344px to **240px** and `size-app-min-height` from 860px to **720px**, with the `usage` rewritten; the `usage` of `z-popover` now mentions the marking legend.
- `project/components/bundle.css`: `.review-legend` (`position: fixed`, `--legend-*` variables, `z-index: var(--z-popover)`) and the new `.review-filters-panel` rule.
- `ReviewRow` (guide and preview): the collapsed filters row (**Filters**, **Filters · N**, "Showing N of M", **Clear filters**) and the open panel, in three cards. The filters have no component of their own in the Map.
- `Minimap` (guide and preview): the anchored marking legend, which drops over the Proposals window and the minimap when the canvas is short (two cards: tall canvas and short canvas).
- `NarrowWindow` (guide and preview): 900×720.
- `project/README.md` (principle 1 and "Stacking"), `project/Layouts.md` and `project/Revisao.md` (one item in "Behavior rules", besides the pending items).
- `project/design-system.json`: only the `lastChange`.

## Ficou sem gravar

- Passou para o registro do épico `epic/sincronia-ds-2`: checking the heights of the new `ReviewRow` (1440) and `Minimap` (1340) cards in the real viewer.
- Passou para o registro do épico `epic/sincronia-ds-2`: the contrast check of the new cards (the anchored legend and the filters panel use only pairs already covered in `Contraste.md`).
