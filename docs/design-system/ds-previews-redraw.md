# Redraw the DS previews of review and notices — [Não lançado] (épico `epic/ds-previews-redraw`)

## Pendências

- **PV1** `ReviewBar` (class: preview; written by PV1; evidence: `src/ui/review/ReviewBar.tsx`, `src/i18n/review.ts` `review.concludeLabel` and `review.concludeTip`; origin `2026-11-21-review-close-notices`): the **Conclude review** state in place of **Apply accepted · N**.
- **PV1** `ProposalRow` (class: preview; written by PV1; evidence: `src/ui/review/ProposalRow.tsx`, `src/i18n/review.ts` `proposals.status.rejected`, `proposals.rejectedCount`, `proposals.rejectedCountOne`; origin `2026-11-21-review-close-notices`): the **Rejected** row, the "N changes rejected" count and the ⋯ menu with **Conclude review**.
- **PV2** `CatalogPage` (class: preview; written by PV2; evidence: `src/ui/NoticeBadge.tsx`, `src/ui/catalog/`; origin `2026-11-21-review-close-notices`): the type notice block and the notice lines in the properties table.
- **PV2** `NoticesView` (class: preview; written by PV2; evidence: `src/ui/NoticesView.tsx`; origin `2026-11-21-review-close-notices`): the window with only the **Accessibility** section and **Only visible layers**.

## Sincronização

Gravado no artefato **Mapping** on 2026-11-22: version 105 (id `1795347226-6b90`). PV1 wrote the two previews and the index (`lastChange`); the CSS needed nothing new (`bundle.css` already had every class used):

- **Written (PV1, version 105)** `ReviewBar/preview.html`: new "decided review, nothing to apply" state with the **Conclude review** primary button and the hint `review.concludeTip`; `@dsCard` `height=540`.
- **Written (PV1, version 105)** `ProposalRow/preview.html`: open row with ⋯ menu open on **Conclude review**, and two **Rejected** rows (plural and singular count) with **Ver** and ⋯; `@dsCard` `height=1445`. Checked in Chrome in the light and dark themes.

PV2 writes the other two (`CatalogPage` and `NoticesView`). The previews use the pt-BR text of the app, so the menu item comes from `proposals.remove`.

## Ficou sem gravar

None so far.
