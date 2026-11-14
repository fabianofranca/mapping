# Canvas in a large project — 2026-11-09 (épico `epic/canvas-escala`, PR #1195, MCP 0.28.11 with no new version, schema v18)

## Alterado

- With the large project in view, dragging, editing and navigating on the canvas get faster: in the 2,000-marking project, the frame of a drag drops from tens of milliseconds to a few, and editing a name redraws only the markings layer and the overlays. Opening an already zoomed-in large project also gets faster, because the canvas only prepares the drawing of the markings that appear on screen.
- From afar, a small marking appears with only its border (no halo, double line, "to review" badge or ⚠) and an almost invisible one, smaller than 2 px, does not appear; the selected one, the one under the mouse and the one with a review mark always appear in full. Zoomed in, nothing changes.
- During a drag (moving, resizing, changing the route or the tip of an arrow), only what moves is redrawn: the cost of each frame no longer depends on the size of the project. What is being dragged appears on top of everything until released (including the floating markings and the component drawings that do not move); on release or cancel, everything goes back to where it was.
