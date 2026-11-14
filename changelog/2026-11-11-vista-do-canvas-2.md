# Canvas view for the tester — 2026-11-11 (épico `epic/vista-do-canvas-2`, PR #1612, MCP 0.34.3, schema v18)

## Adicionado

- `.canvas-host` publishes three new read-only test attributes, for whoever tests and drives the flow (nothing changes on screen):
  - `data-selection`: `"<type> <id>"` of the primary selection (`image`, `marking` or `arrow`); it disappears with no selection or with the item outside the drawn project. It says which item the click selected when there is an overlay.
  - `data-arrow-handles`: with an arrow drawn as the primary selection, the entries `"<name> <x> <y>"` separated by `;`, in CSS px relative to the host's corner (like `data-selection-box`): `center` (the middle of the stroke, where the click grabs the arrow), `from`, `to`, `point<i>`, `mid<i>` and `segment<i>`. It disappears with **Show arrows** turned off or with no arrow selected.
  - `data-container-boxes`: one entry `"<id> <x> <y> <width> <height> <scale>"` per placed container, in canvas units and in the drawn placement (open perspective and review). Pan and zoom do not redo it.
- New tester helpers in `scripts/testing/cloud.mjs`, to find a point on the screen without capturing:
  - `onCanvas(page, { x, y })` returns `{ ok, element }`: does the point fall on the canvas, or is the minimap, a window or the bar on top of it? It is the single check for `ponto`, `drag` and `paletteDrag`.
  - `viewCenter(page)` returns the center of the view, in screen px and in canvas units.
  - `arrowHandlesOf(page)` returns the middle and the handles of the selected arrow already as a screen point, or `null` (with `parseArrowHandles` and `parseContainerBoxes`, the pure parts).
- The `Seleção:` line of `state()`, after `Foco:`, says what the click selected: `marcação "Lado" (<id>)`, `seta "A → B" (<id>)`, `container "Tela" (<id>)` or `nenhuma` (without a folder or with a proposal item in the review, `marking <id>`).
- Appendix A of `docs/TESTING.md` gains the three attributes, the view center, the visible area, the overlay, the example with the arrow and the `menuitemradio` of the stroke menu.

## Alterado

- `ponto` gives the point of the **drawn** position (it reads `data-container-boxes`), also with another perspective open and in the review. It warns on stderr when the requested `--perspectiva` is not the drawn one and when the point falls outside the canvas. The CLI output stays `<x> <y>`.
- `drag` throws, before any mouse action, when the starting point does not fall on the canvas (`{ allowOffCanvas: true }` still works) and warns when the selection click selected nothing.
