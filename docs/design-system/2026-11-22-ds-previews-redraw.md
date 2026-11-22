# Redraw the DS previews of review and notices — 2026-11-22 (épico `epic/ds-previews-redraw`)

## Pendências

- **PV1** `ReviewBar` (class: preview; written by PV1; evidence: `src/ui/review/ReviewBar.tsx`, `src/i18n/review.ts` `review.concludeLabel` and `review.concludeTip`; origin `2026-11-21-review-close-notices`): the **Conclude review** state in place of **Apply accepted · N**.
- **PV1** `ProposalRow` (class: preview; written by PV1; evidence: `src/ui/review/ProposalRow.tsx`, `src/i18n/review.ts` `proposals.status.rejected`, `proposals.rejectedCount`, `proposals.rejectedCountOne`; origin `2026-11-21-review-close-notices`): the **Rejected** row, the "N changes rejected" count and the ⋯ menu with **Conclude review**.
- **PV2** `CatalogPage` (class: preview; **Written (PV2, version 106)**; evidence: `src/ui/NoticeBadge.tsx`, `src/ui/catalog/`; origin `2026-11-21-review-close-notices`): the type notice block and the notice lines in the properties table.
- **PV2** `NoticesView` (class: preview; **Written (PV2, version 106)**; evidence: `src/ui/NoticesView.tsx`; origin `2026-11-21-review-close-notices`): the window with only the **Accessibility** section and **Only visible layers**.

## Sincronização

Gravado no artefato **Mapping** on 2026-11-22: version 105 (id `1795347226-6b90`) and version 106 (id `1795349334-38f6`). PV1 wrote the first two previews and the index (`lastChange`); the CSS needed nothing new (`bundle.css` already had every class used):

- **Written (PV1, version 105)** `ReviewBar/preview.html`: new "decided review, nothing to apply" state with the **Conclude review** primary button and the hint `review.concludeTip`; `@dsCard` `height=540`.
- **Written (PV1, version 105)** `ProposalRow/preview.html`: open row with ⋯ menu open on **Conclude review**, and two **Rejected** rows (plural and singular count) with **Ver** and ⋯; `@dsCard` `height=1445`. Checked in Chrome in the light and dark themes.
- **Written (PV2, version 106)** `CatalogPage/preview.html`: new "type with notices" state: the type's notice blocks (**Removed** with `since` and origin, **Pending**) under the description, and the notice lines (**Deprecated**, **Pending** and **Diverges** on a column) in the **Description** cell of the properties table; `@dsCard` `height=3480`. Checked in Chrome in the light and dark themes.
- **Written (PV2, version 106)** `NoticesView/preview.html`: the window with only the **Accessibility** section (group row with count and one `touch-target-small` row) and **Only visible layers**, plus the empty states "No accessibility notices." and "No notices in the visible layers."; the old kind buttons, "Only notices in use" and library groups are gone; `@dsCard` `height=730`. Checked in Chrome in the light and dark themes.
- **Written (PV2, version 106)** `bundle.css`: the `.notices-table` rules (header ellipsis and the annotation cell break), copied from `src/theme/panels.css`.

PV2 wrote the last two (artifact version 106, id `1795349334-38f6`, `lastChange` updated). The previews use the pt-BR text of the app.

## Ficou sem gravar

Nothing: PV1 and PV2 wrote every preview in the Mapping artifact (versions 105 and 106).
