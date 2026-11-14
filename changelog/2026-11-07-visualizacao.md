# View — 2026-11-07 (épico `epic/visualizacao`, PR #714, MCP 0.24.1, schema v15)

## Adicionado

- The **view mode**: the **View** button (`Alt+H`) leaves the canvas view-only and opens the **Show on canvas** panel, in which the person chooses what appears: containers, images, outline and name of the markings, arrows and the drawing of each layer that draws. **Show all** checks everything and **Screens only** leaves the canvas of the old Clean view. The **Show on canvas** button, next to it, reopens the panel; **Esc** closes the panel and, afterward, leaves the mode; the status bar warns that the mode is view-only. The choice is kept per project, in this browser.

## Alterado

- The active layer is gone. The **Markings without annotations** filter (Show all, Dim without annotations, Hide without annotations) now applies across the visible layers: the marking disappears or dims when it has no annotation in any visible layer.
- Any layer can be hidden, including the last visible one. With all hidden, the **Annotations** section of Details says "All layers are hidden." and offers **Show all**.
- In the review, the hidden-layer notice counts by the hidden layers, with no exception for the first layer.
- Gone are the "+ Annotation" button at the top of Details (the **+** of each layer stays), the `Alt+N` shortcut, the ✓ "Make active", the "Layers (active: …)" chip of the main bar and the "active" badge in the layer groups.
- The **Clean view** became the **View** mode (`Alt+H`): the canvas for viewing only, where nothing is selected or edited. It shows containers, images, marking names and arrows (the marking outline starts unchecked) and keeps the choice per project in this browser. With arrows checked they appear even without the marking outline, and the **Markings without annotations** filter does not apply in the mode.

## Corrigido

- `Alt+H` also turns off the view mode with the focus on a checkbox of the **Show on canvas** panel (before, it only worked with the focus on a button).
- When leaving the view mode, the focus goes to **View**, and **Show all** (Annotations in Details, with all layers hidden) leaves the focus in the section, instead of losing it in the page body. The panel opened when turning the mode on returns the focus to **View** when it closes.
- The **View** tooltip no longer covers the title of the open **Show on canvas** panel.
