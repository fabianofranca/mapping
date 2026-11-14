# Review in short windows — 2026-11-06 (epic `epic/revisao-janela-baixa`, PR #623, MCP 0.19.0, schema v14)

## Alterado

- Minimum window height: from 860 px to **720 px** (minimum width stays 900 px). Below 900×720 the app shows the "Open in a larger window" notice, now with 720 in the text.
- Review: the Proposals window filters (decision, change type, image, layer and **Conflicts only**) are collapsed into the **Filters** button, which shows how many groups are active ("Filters · 2"). The "Showing N of M" and **Clear filters** stay beside the button; choosing a filter does not close the panel, and **Esc** closes it and returns focus to the button. The new-conflicts notice button still turns on **Conflicts only** without opening the panel. Outside the review nothing changes.
- Review: the bottom window (Proposals) starts shorter, at 240 px (before 344 px): 3 whole list rows and the shortcut footer fit at 900×720. Whoever had 344 px stored moves to the new default; any other stored value stays.
- Review: the mark legend is no longer clipped by the canvas. When the canvas is shorter than it, the legend drops over the Proposals window (and the minimap), whole and without scrolling, down to the top of the status bar, without going past the canvas column or covering the side windows. Tooltips, selectors and dialogs stay on top of it.

## Corrigido

- Review: the **L** shortcut closes the mark legend returning focus to the **Mark legend** button also when focus was inside it (before focus went to the `body`).
