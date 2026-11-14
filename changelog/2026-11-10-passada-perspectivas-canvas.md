# Visual pass over perspectives and the canvas — 2026-11-10 (epic `epic/passada-perspectivas-canvas`, PR #1496, MCP unchanged, schema v18)

## Corrigido

- The "Came from…" badge does not cover the name of another screen: a large root with another root right below puts the badge above the strip with its name.
- The Arrival area caption does not touch the canvas edge: it stays 8 px from each edge of the visible area and, when wider than it, gets an ellipsis.
- **Send to perspective…** has the same font, height and border as the other buttons.
- The short canvas notices (such as "Each side must be at least 8 px.") and the progress one are small, at the foot of the canvas, on the left, and do not cover the top of the image; errors and Read-only stay at the top.
- In the wide canvas bar (above 470 px), the selection is the last part of the path to shrink.
- The short notice at the foot of the canvas appears whole with the Tree and the Details open at 900×720: it wraps onto two lines instead of being cut off with an ellipsis.
- The "Came from…" badge does not fall over the title of another root or over the title of the Arrival area, even at the low zoom of **Fit all** or with the top of the strip out of view: each possible place is pulled into the view before the badge chooses where to sit.
