# Drawing fidelity — [Não lançado] (épico `epic/drawing-fidelity`, PR #3098, MCP 0.71.0, schema v25 unchanged, viewer 0.13.0)

## Adicionado

- Component format 4: an expression (`$switch`, `$if`, `$field`, the math, `$var`) in each item of a `cornerRadius` list, in `image.fit` and in the shadow numbers `x`, `y`, `blur` and `spread` (also in each shadow of a list), so a component no longer repeats a node or a list per value (#2914). A result outside the set draws the default (0, `cover`) and the drawing warns `invalid value in cornerRadius: <value>`, `invalid value in image.fit: <value>` or `invalid value in shadow.<key>: <value>`. In a version lower than 4 each is `only allowed with formatVersion 4`, at its path. The app, the viewer and the MCP PNG draw them the same way.
- Example package `examples/libraries/drawing-fidelity/`: the Corner card (four corner radii from two fields), the Photo (the package image with the `fit` of a field) and the Signal (an outer shadow whose `y` and `blur` follow a size field, with an `evenodd` ring icon on top). Later phases of the stage add types to it.
- Component format 4: `shadow.inner` is valid on `path` and `icon` (on `text` or `image` the error is `shadow.inner: only valid on frame, rect, ellipse, path and icon`). On a `path` the shadow follows the path with its fill rule; on an `icon` it is the union of its paths, each with its fill rule, inside the icon's `clip`, so it lies over each glyph. It sits above the fill and below the stroke; `spread` is ignored. A list on a `path` or `icon` draws the first outer shadow and every inner one. An `ellipse` arc draws its inner shadow too. The app, the viewer and the MCP PNG draw it the same way; the Signal of the example package has it on its icon.
- `spec-author` skill, `docs/AGENT-GUIDE.md`, `docs/COMPONENT-FORMAT.md`, `docs/component.schema.json` and `docs/MCP.md`: the new expression positions and the "Update the MCP first" note.

## Alterado

- The `dist/index.html` ceiling rose 16 KiB, from 2801664 to 2818048, by the budget rule; above the limits, `bug` #3102 for the owner to review.
