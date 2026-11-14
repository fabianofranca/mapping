# Canvas without dots — 2026-11-08 (epic `epic/canvas-sem-bolinhas`, PR #986, MCP 0.28.4, schema v18)

## Alterado

- Markings on the canvas no longer show the layer dots or the `+N` after the fourth. The top-left corner holds only the "needs review" badge and the ⚠ of an incomplete annotation, in that order, flush with the margin, and the semantic-zoom name starts right after them.
- Each annotation's layer is seen in the Tree, in Details and in the List (and its color, in the Layers window).
- Accepted consequence: a marking with the component drawing in view (no border, no mouse over it, no selection) and with no pending item has no mark of its own on the canvas until the mouse passes over it or it is selected.
