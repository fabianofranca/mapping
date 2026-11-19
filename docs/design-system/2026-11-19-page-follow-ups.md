# Page follow-ups — 2026-11-19 (épico `epic/page-follow-ups`)

## Pendências

DS impact of PF1 (model, store result, MCP and docs): none.

- **PF2 — "Move to page refused" dialog:** gets an anchor group (rows "<anchored> anchored to <target>" with **Go to the marking**, the same `page-refused-list` row as the arrows) and two new titles ("The move would cut anchors"; "The move would cut arrows and anchors"). Arrows only: unchanged.
- **PF2 — "Delete page" confirmation:** a muted line, "N conversations on empty spots of this page lose their place: they stay in Comments, without a place." (singular for 1), shown in the empty, move and discard forms when N > 0.
- **PF3 — Page menu:** in the review's Proposed view the row of a page that only the proposal creates carries the tag "New in this proposal" (an accent pill, `--color-accent` over `--color-accent-text`, `--radius-full`, `--t-text-small`) before the item count (`page-row-tag`); the pages and counts are the preview's. In the Current view and outside the review: unchanged.
- **PF3 — Shared picker row:** the Page menu and the perspective picker render through one list (`PickerList`: shell with focus on the open row and ↑/↓ over the options and actions) and one option row (`PickerOption`: check, name and the trailing texts); the classes (`page-row`, `perspective-row`), the look and the keys are the same as before.

## Sincronização

Gravado no artefato **Mapping** em 2026-11-19: versão 98 (guides at version 97, the index last at 98, read right before with `lastChange` filled in). No file deleted, no preview touched (the three components have a guide only, no preview).

- **`PageDialogs` guide (PF2):** the "Move to page refused" dialog now covers arrows and anchors: the anchor group (the same `page-refused-list` row, "<anchored> anchored to <target>" and **Go to the marking**), the three titles (arrows only unchanged, plus "The move would cut anchors" and "The move would cut arrows and anchors"), the labels `page.move.refusedAnchor*` and `page.move.goToMarking`. The "Delete page" section gained the muted line about conversations on empty spots (N > 0, singular for 1, in the empty, move and discard forms), the two states and the code references.
- **`PageMenu` guide (PF3):** the "New in this proposal" tag (`page-row-tag`, `--color-accent-text` over `--color-accent`, `--radius-full`, `--t-text-small`, before the count in `page-row-trail`; Proposed view of the review only), the shared `PickerList` and `PickerOption` and the new classes and files in "No código". Contrast checked from `src/theme/tokens.ts`: 5.7:1 in the light theme, 6.8:1 in the dark theme.
- **`PerspectivePicker` guide (PF3):** the list and the row come from the same `PickerList` and `PickerOption` (shell with focus on the open row and ↑/↓; look and classes unchanged), and `src/ui/PickerList.tsx` in "No código".

## Ficou sem gravar

None.
