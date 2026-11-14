# Undo apply — 2026-11-08 (epic `epic/desfazer-aplicacao`, PR #927, MCP 0.28.2, schema v18)

## Corrigido

- In the review of a proposal, `Ctrl+Z` and `Ctrl+Shift+Z` now only undo and redo what **that** proposal applied. Before, the second `Ctrl+Z` also undid the application of another proposal, and the app got stuck in read-only review with **Blocks applying** until **Exit anyway**. The refusal is silent (the **Undo** button stays disabled). Outside the review nothing changes.
- Undoing or redoing the application of a proposal now waits for the `proposal.json` write: until it finishes, `Ctrl+Z` and `Ctrl+Shift+Z` do nothing (two in a row do not cross). If the write fails, the step is reverted, the proposal stays as it was on disk and the app shows the proposal write error.
