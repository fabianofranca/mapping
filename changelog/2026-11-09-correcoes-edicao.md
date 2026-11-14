# Fixes in editing — 2026-11-09 (épico `epic/correcoes-edicao`, PR #1113, MCP 0.28.5 unchanged, schema v18)

## Corrigido

- The multi-line text field now shows the annotation's current value: after an undo or a reload from an external change, it does not keep the old text, and leaving the field without editing does not write the old text over it.
- In the multi-line text field, the cursor no longer jumps to the end on every typed key, and focus does not return to the field after leaving it.
- Dialogs only close on a full click on the backdrop: selecting text by dragging outside the box and releasing over the backdrop no longer closes the dialog or discards what was typed.
- With a perspective open, the layer checkbox in the List, "Show layer" in the marking and arrow panels, "Go to annotation" and the layer citation chip now change the hidden layers of the perspective itself (with undo), as the Layers window already did; before, they changed the hidden ones of the Main perspective and the layer did not appear.
- Deleting a conversation that fails to save (permission or a file changed externally) now shows the error: in the confirmation dialog, which stays open, or as a notice when the conversation is only yours; before, the conversation stayed in the list without a notice.
- A malformed window layout saved in the browser (for example, the list of open windows with a value of another type) no longer leaves the app blank: the invalid field falls back to the default (Tree, Layers and Details).
- Dropping a file outside where the app imports it (panels, home screen, read-only or busy canvas, proposal review) no longer makes the browser open the file in the tab and close the editor.
- Shift+Enter in a one-line field with text not yet confirmed no longer loses the break: "Line 1" + Shift+Enter + "Line 2" stays on both lines.
- With a perspective open, "Show all" in Details (the notice of all layers hidden) removes the hidden layers from the perspective, with undo; before, it did nothing.
