# Cloud helpers and guide fixed — 2026-11-04 (epic `epic/testador-ajustes`, PR #417, MCP 0.13.0, schema v13)

## Corrigido

- `selectFolder`, `openFile`, `saveFile` and `cancelDialog` (`scripts/testing/cloud.mjs`) wait for the native dialog to appear (5 s, retrying every 150 ms, optional `timeoutMs`) instead of looking for it just once. When the time runs out, the error carries the expected titles, Chrome's active window and, if the active tab is not the app's, the probable cause (two tabs in the window). New `waitForWindow`.
- `clickNoWait` accepts `{ scope, exact }`, counts the candidates before clicking and fails (with the name and the count) if it finds zero or more than one, instead of silently picking one.
- `docs/TESTING.md`: R4.5 describes the two rejection notices together (the one in the Details header and the one in the canvas corner) and the **together** mark as the app shows it (link icon on the card, badge with text in the review list), checked by a component test; appendix A and section 4 cover the native picker with two tabs, and recipe 4 explains the repeated accessible names and the `scope`.
