# Canvas in a large project — 2026-11-09 (épico `epic/canvas-escala`)

## Pendências

- **DA3 — tokens** (Tokens section of the map in `docs/DESIGN-SYSTEM.md`, sizes): `size-lod-min-marking` (24px; a marking smaller than this on screen, in width or height, draws only the border) and `size-lod-hide-marking` (2px; smaller than this in both measures, it is not drawn). Both read by the canvas (`canvas/theme.ts`), in both themes.
- **DA3 — `CanvasMarking` and `Canvas.md`:** the level-of-detail rule. From afar a small marking appears with only the border (no halo, double line, "needs review" badge or ⚠) and an almost invisible one does not appear; the selected one, the one under the mouse and the one with a review mark always appear in full.
- **DA4 — `Canvas.md`:** during a gesture (move, resize, route and arrow tip), what is being dragged is drawn above everything until release (including the floating markings and the component drawings that do not move); on release or cancel, the drawing order goes back to the usual one. No new token, icon or component.

## Sincronização

Gravado no artefato Mapping in Claude Design on 2026-11-09 (version 64, `lastChange` "Fechamento do epic/canvas-escala"):

- `tokens.json`: `size-lod-min-marking` (24px) and `size-lod-hide-marking` (2px), in the `size` family (147 to 149 tokens).
- `Canvas.md`: the two tokens in the "Size" row of the table of tokens the canvas reads, the "From afar (level of detail)" row in the markings table and the "During a gesture" paragraph.
- `components/CanvasMarking/README.md`: the "Level of detail" paragraph and the gesture sentence in "States".

No new component, icon or preview; the previews (`preview.html`) did not change.

## Ficou sem gravar

Nothing.
