# Review notices on one row — 2026-11-06 (épico `epic/aviso-revisao-compacto`)

## Pendências

- **`Notice`, row variant (`size="line"`):** warning icon, short text on a single row (ellipsis if it does not fit, with the full sentence in the `Tooltip` tip and, hidden, in the `role="status"` for the screen reader), the action (`Button` `sm`) and the X (`IconButton` `close` `sm`, name "Dismiss"). Height of `--control-height-sm` plus the border; `--space-2` of side padding, no vertical padding; `--t-text-small` font; no line wrapping. The `md` and `sm` uses do not change. No new token. Files: `src/ui/Notice.tsx`, `src/theme/review.css` (`.notice-box-line`, `.review-levels > .notice-box-line` with a `--space-1` top margin). Update `Notice` in the artifact (guide and preview: the row variant, in the light and dark themes).
- **Review list (`ReviewLevels`):** the new-conflicts and superseded-proposal notices become the row above, between the filters row and the **Level** header, with the X. New texts: `review.stale.short`, `review.stale.showShort` and `review.superseded.short`. Files: `src/ui/review/ReviewLevels.tsx`, `src/i18n/review.ts`. Update `ReviewRow` (review list with the notice on a row, at a 240 px window).

## Sincronização

Gravado no artefato **Mapping** on 2026-11-06, when closing the epic (version 47; the index along with it, with `lastChange`):

- `Notice` (guide and preview): the row variant (`size="line"`, `hint` prop), with the measurements and the X; two cards in the preview (new conflicts and superseded proposal, the latter with an ellipsis).
- `project/components/bundle.css`: `.notice-box-line` and its rules, and `.review-levels > .notice-box-line`.
- `ReviewRow` (guide): the notice on a row between the filters and the **Level** header, with the measured heights.
- `project/design-system.json`: only the `lastChange`.

## Ficou sem gravar

- Passou para o registro do épico `epic/sincronia-ds-2`: the row notice card (new conflicts and superseded proposal, 240 px window) in the `ReviewRow` preview.
- Passou para o registro do épico `epic/sincronia-ds-2`: the visual check of the `Notice` row cards in the light and dark themes (no new color), with the tone of the new-conflicts card corrected (the app uses `warning`).
