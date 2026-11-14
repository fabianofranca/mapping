# Visual polish — 2026-11-05 (épico `epic/acabamento-visual`, PR #541, MCP 0.16.0, schema v13)

## Alterado

- Layer header in Details: the priority is name > flag > badge. The review's "hidden" flag keeps its full text (it is a layer state); the specialization badge is the first to shrink, then the name, and whatever is cut off shows the full text in the tooltip.
- Side strips: the tooltip of the buttons now appears beside the button (not below it), so it no longer covers the Catalog search field or the contents of the windows.

## Corrigido

- Menus (canvas and Tree): an entry's shortcut (for example, Ctrl+G on **Wrap**) sits to the right of the button, not glued to the label.
- Details: with the panel narrow (at 900 px, in review or out of it), X, Y, W and H show 4-digit values in full; before, the third digit of Y and W was cut off.
- Canvas: the selection rectangle (Shift+drag) gets the same dark halo as the selection and the draft; its silhouette now passes 3:1 against the canvas background in the light and dark themes.
- Console: the Konva warning that the stage has 6 layers no longer appears when opening a project (arrows and markings now share a layer, without changing the drawing order).
- Details: with the project opened from a folder (where the **Copy reference** button exists), an annotation card's header wraps onto two lines and the name field keeps a minimum width; at 900 px, in review, the panel no longer gets a horizontal bar and the name field is no longer squeezed (the defect already existed before the stage).
