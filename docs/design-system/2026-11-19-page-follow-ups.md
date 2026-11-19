# Page follow-ups — 2026-11-19 (épico `epic/page-follow-ups`)

## Pendências

DS impact of PF1 (model, store result, MCP and docs): none.

- **PF2 — "Move to page refused" dialog:** gets an anchor group (rows "<anchored> anchored to <target>" with **Go to the marking**, the same `page-refused-list` row as the arrows) and two new titles ("The move would cut anchors"; "The move would cut arrows and anchors"). Arrows only: unchanged.
- **PF2 — "Delete page" confirmation:** a muted line, "N conversations on empty spots of this page lose their place: they stay in Comments, without a place." (singular for 1), shown in the empty, move and discard forms when N > 0.
- **PF3 — Page menu:** in the review's Proposed view the row of a page that only the proposal creates carries the tag "New in this proposal" (an accent pill, `--color-accent` over `--color-accent-text`, `--radius-full`, `--t-text-small`) before the item count (`page-row-tag`); the pages and counts are the preview's. In the Current view and outside the review: unchanged.
- **PF3 — Shared picker row:** the Page menu and the perspective picker render through one list (`PickerList`: shell with focus on the open row and ↑/↓ over the options and actions) and one option row (`PickerOption`: check, name and the trailing texts); the classes (`page-row`, `perspective-row`), the look and the keys are the same as before.

## Sincronização

Nothing to write to the **Mapping** artifact yet.

## Ficou sem gravar

None.
