# Conclude a decided review and group library notices — 2026-11-21 (épico `epic/review-close-notices`)

## Pendências

- **RN1** `ReviewBar` (`src/ui/review/ReviewBar.tsx`): the **Conclude review** label replaces **Apply accepted · 0** when the review is decided and nothing is left to apply, in the same place and with the same shortcut.
- **RN1** `ProposalRow` (`src/ui/review/ProposalRow.tsx`): the **Rejected** badge and the "N changes rejected" count, with **View** and the ⋯ menu (**Delete proposal…**, and **Conclude review** on a concludable open row).
- **RN3** `NoticeBadge` (`NoticeBlock` and `NoticeLines`, `src/ui/NoticeBadge.tsx`) in the `CatalogPage`: the type's notice block under the description and the notice lines in the **Description** cell of the properties table; and the Details and the review change box with no notices (`NoticeLabelIcon` removed).
- **RN4** `NoticesView` (`src/ui/NoticesView.tsx`): the window with only the **Accessibility** section and **Only visible layers** (no kind buttons, no **Only notices in use**, no library groups), the empty states "No accessibility warnings." and "No warnings in the visible layers.", and the tab and status bar counting only annotations with an accessibility warning.

## Sincronização

Gravado no artefato **Mapping** on 2026-11-21: version 101 (id `1795230178-478c`). The four `## Pendências` guides were updated, keeping the authors' wording elsewhere:

- `ReviewBar/README.md`: the primary button becomes **Conclude review** when everything is decided and nothing is left to apply, with a new row in the states table.
- `ProposalRow/README.md`: the **Rejected** status row, the "N changes rejected" count and the ⋯ menu (**Conclude review** on a concludable open row).
- `CatalogPage/README.md`: the new library-notices paragraph (the type `NoticeBlock` under the description and the `NoticeLines` in the description cell of fields and columns) and the code line.
- `NoticesView/README.md`: rewritten for the window with only the **Accessibility** section, the **Only visible layers** filter, the two empty states and the accessibility-only count.

`project/design-system.json` (index) was written last, with `lastChange` filled in. The first two publish attempts were refused ("latest version not viewed"); after rereading the files and a page-level read the third went through, with no `force`.

## Ficou sem gravar

- The `preview.html` of `ReviewBar`, `ProposalRow`, `CatalogPage` and `NoticesView`: not redrawn. They are large hand-drawn pages (`ReviewBar` 30 kB, `ProposalRow` 34 kB, `CatalogPage` 23 kB, `NoticesView` 19 kB) and still show the earlier states (**Aplicar aceitas · 0** only, no `Rejeitada` row, the notice groups and kind filter in the Notices window, no notice lines on the Catalog page). The READMEs, now current, are what the guides promise; the previews need a redraw by the owner or a follow-up (issue opened at the closing).
