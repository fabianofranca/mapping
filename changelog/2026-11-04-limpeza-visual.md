# Visual cleanup — 2026-11-04 (epic `epic/limpeza-visual`, PR #451, MCP 0.13.0, schema v13)

## Alterado

- Explanations stop taking up lines of text on screen and become a help icon (ⓘ) with a tooltip: each field's description, the annotation type's (beside the type name), the "Linked to" and the arrow's and marking's lock notice (beside the padlock, also when the lock comes from a locked parent). The tooltip appears with the mouse and with keyboard focus; Enter pins it and Esc closes it. For a screen reader, each icon has the name "About …" and the text as its description, and the field gets the explanation as its accessible description. Errors, pending items and state notices (such as the empty owner) remain visible.
- The container is no longer marked by the "Container" pill and gets a discreet icon (a frame without the **+**, borderless) in the Catalog list, in the component page title and in the Library palette. The word "Container" stays in the tooltip (mouse and keyboard) and in the accessible name. The Catalog and palette lists also stop showing the default size (W × H); it remains in the new container dialog and in the Playground of the component page.

## Corrigido

- The Esc that closes the help tooltip (ⓘ) closes only the tooltip: it no longer clears the selection (Details stay open) nor closes the surrounding dialog. After an Esc, Enter or a click on the icon reopens the tooltip (before, it stayed invisible with `aria-expanded="true"`). The **Position / Size** icon in the review Details is now called "About Position / Size" (before "About ").
- In the review Details, "Position" and "Size" no longer break letter by letter: the label column gets the width of the help icon and the label never breaks in the middle of a word, at 900 and 1280 px, with or without the changed-field marker.
- In the Library palette, the type name (for example `LazyColumn`, `HorizontalPager`) stays whole on the line, with an ellipsis if it does not fit, and the container icon sits beside it, not on a second line.
- The locked container (image) treats the lock like the marking and the arrow: the "Locked: …" box below the header goes away and the "About the lock" icon enters beside the padlock. On the locked arrow, the icon and the padlock stay together at any width (at 1280 and 1600 px the icon went to the title line).
- The Catalog documents now understand the quote (`> text`): it becomes a quote block instead of showing the loose `>` sign (for example, in the notes of the **Button** `code`).
- Esc now hides a button's tooltip also when focus is from the keyboard (before it only went away with the pointer over it): it applies to the help icon (ⓘ) and to the buttons' tooltips; Enter, click or the pointer reopen it.
- In the Library palette, the label of the Add button ("Add to screen …", "Add to canvas") is no longer cut off on both sides and now ends in an ellipsis when it does not fit.
- In the review Details at 900 px, the X, Y, W and H fields stop cutting off digits (less side padding in the fields).
