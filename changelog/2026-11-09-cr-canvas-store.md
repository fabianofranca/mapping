# CR of the canvas and the store — 2026-11-09 (épico `epic/cr-canvas-store`, PR #1238, MCP 0.28.12, schema v18)

## Corrigido

- Canvas: when the proposed removal of the selected marking is rejected, the strikethrough on the name label disappears in the same frame (before it stayed until a pan or another selection), and the strikethrough no longer goes past the label's width when the name is long and shown truncated.
- Canvas: the "Came from <name>" badge no longer comes out truncated on the first draw (the width is now measured with the theme's font).
- Canvas: a short middle-button click does not select, does not clear the selection and does not place the Comment pin.
- Canvas: releasing Space with focus in a field no longer leaves the drag stuck in pan; Space is also not canceled on links and buttons.
- Canvas: Ctrl+click opens the context menu (on macOS), without turning into a selection click.
- Components: rich text with an outline (`stroke`) has fill and outline, like plain text, instead of coming out hollow.
- Components: the embedded image (`data:`) respects the fill fit (`cover`, `contain`, `fill`; default `cover`) instead of stretching, and is not decoded again on every draw.
- Components: a frame with no fill or stroke shows the shadow (it goes to the first child).
- Catalog: the example images come out with the embedded images (before they came out with the placeholder) and the gallery keeps one image per example, without accumulating those from old times.
- Components: with more than 64 remote images in view, they no longer flicker or get downloaded again in a cycle.
- Catalog and Playground: the drawing notices appear in the app's language (before they always came out in Portuguese); the text and colors of the box for a type without a component come from the theme.
- Project: a migrated file that another program rewrites in the current schema before the first edit no longer generates an obsolete "backup of the original" or the backup notice.
- Windows: Details collapsed in the compact window only applies on the first visit; when reopened, it does not collapse again when switching projects.
- Undo/redo: an immediate failure of the effect tied to the proposal (not only the asynchronous one) returns the step and shows the error.
- Diagnostics: an invalid image URL (`data:`, `file:` etc.) appears with the scheme (and only the type for `data:`), instead of `null…`.
- Proposals: the proposals Diagnostics updates when the problem changes (a broken file that goes away and another that breaks, or the same file with another error), even with the same number of problems.
- Proposals: a disk failure on apply (reading the image or the package, copying the image) shows the write error and removes the images already copied, instead of failing without a notice and leaving them loose; if the project changed during a write that failed, the copies it cites stay.
- Comments: the chosen conversation (or the draft of a new conversation) no longer comes back by itself when clicking on an item and then on empty space; the unsent text stays saved and reappears when the draft is opened at the same point.
- Comments: when repositioning an already open conversation draft (Comment and a click on another point), focus goes to the composer, instead of the typed text going to the canvas.
- Comments: the "read" marks are not lost when Mapping is open in two tabs, and the device keeps the 20 most recent project copies.
- Catalog: a specialization whose catalog failed to load is tried again on the next request (before it stayed without a catalog until the project changed).

## Alterado

- Canvas: less work per frame and per gesture: dragging no longer recalculates the list of images to load, measuring the canvas size without a change does not schedule a frame for nothing, the hatching of the removed marking draws only the visible part and the arrival badge does not force the page layout on every frame. The drawing does not change.
- Embeddable viewer (`mapping-viewer`): the `ScreenRenderer` receives the texts of the missing-type box and of the caller's notices (`labels`); `createViewer` passes its own, in Portuguese, as before. Whoever creates a `ScreenRenderer` directly must pass `labels` (there is `VIEWER_LABELS` for the default).
- Store: undo, redo and each edit notify the panels only once; the banner and the status bar do not recalculate the proposal conflicts on every edit; the external files check reads images, proposals and conversations in parallel; selection by rectangle and selection switching no longer grow quadratically. The behavior does not change.
- Review: holding the arrow key to walk through the changes saves the resume point at most once per frame (before, on every key), and the closed review saves it at once; the list of package files of each proposal is read once.
- Store: conversations only republish the list when something changed; perspective positioning checks image overlap once per root; the reads of components and fonts run in parallel; the font sync, the pending-item tracking and the serial queue of catalogs, proposals and conversations come from common helpers. The behavior does not change.
