# Visual pass on Details — 2026-11-10 (épico `epic/detalhes-visual`, PR #1460, MCP 0.30.0 unchanged, schema v18)

## Corrigido

- At **900 px** wide, with Tree, Layers and Details open, the right-hand window no longer goes under the strip: the strip's **Details** button no longer covers about 9 px of the window's **X** nor rests on its scroll bar. The minimum of the left column dropped from 200 to 180 px, so that the minimums of the two sides and of the canvas (180 + 280 + 360) fit in the area of the minimum window (900 minus the two strips). At 1280 px nothing changes.
- The **+** of a layer with no type to offer says the reason (specialization unavailable, layer without types, only floating types or types that do not apply to arrows or markings) and the way: the Note is created from the Palette (Catalog › Palette › Add to canvas). The **+** of the Notes layer no longer offers the Note or the Table to a regular marking or to an arrow; on a floating marking it stays as before. The model and the MCP still accept the floating-type annotation.
- The **Incomplete only** checkbox of the List uses the alert icon (the outlined triangle of Details), and the accessible name is just "Incomplete only".
