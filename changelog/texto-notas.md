# Text type in the notes library — [Não lançado] (PR #2197, épico `epic/texto-notas`, MCP 0.45.0, schema v21)

## Adicionado

- **Text type in the notes library (version 5):** `texto`, plain text with no background, border or shadow, for the labels, titles and captions that a mapping needs next to the drawing (the column labels and the title of a design page, for example).
  - Fields: **Text** (required), **Size** (14 when empty), **Weight** (`regular`, `medium`, `semibold`, `bold`), **Color** (free `#RRGGBB`, `#1F1F1F` when empty) and **Width** (`auto`: the box follows the text, one line per typed line; `fixa`: the text wraps at the marking's width and only the height follows). **Arrange** and `fit_marking` follow the mode.
  - It is not floating: it is born on the canvas or inside a container, by geometry, and inside a container it follows the container when it is moved or scaled. **Floating** (or `update_marking` with `floating: true`) puts it above everything.
  - It appears in the Palette and in `create_marking` (`notas/texto`, with or without `container`). On a plain marking, **New annotation** of the Notes layer now offers **Text** (before, it offered nothing: **Note** and **Table** are floating). Projects that already have the notes library at version 4 keep it until the library is updated (see the next item).
- **Update to the built-in version of the notes library:**
  - **App:** **Specializations** shows **Update to the built-in version (v5)** on the Notes row of a project with the library at version 4. It opens the package review window and **Update** brings the `texto` type in one undo entry. At version 5 the button does not show; read-only, it is disabled.
  - **MCP:** `plan_library_update` and the `update_specialization` operation accept `builtin` (`notas`) in place of `path`/`file`, exactly one of them (`invalid-arguments` otherwise, listing the ids in `builtin`). A `create_marking` of `notas/texto` in the same batch already sees the component. `apply_specialization` does not take `builtin`.
- `docs/AGENT-GUIDE.md`: the modeling pattern for the notes library: `notas/texto` for the mapping's own labels and titles, the text type of the screen's library for the text the screen really has.
- Tests: the ceiling of the generated guide of each block of the full round (`MAX_BLOCK_GUIDE_CHARS`) went from 201,000 to 207,000 characters: R12.45 to R12.53 took block 3 to 207.0 thousand.
- MCP: the `type` of the operations resolves `specId/typeId`, then the type `id`, then the name (before, all three were mixed): the name "Text" of `notas/texto` does not make the id `text` of another library ambiguous.

## Corrigido

- **Canvas drag and rubber band (directed round, BC.1, 1, E.1):** a press now grabs the item a click would select, whether or not the selection is already there: dragging a container under a canvas marking moves the container, dragging a marking inside a selected container moves the marking, and a Shift+drag that starts near a corner of another item starts a rubber band instead of moving or resizing the selected container (unless it starts on a handle of the selection or of an item that wraps it). Dragging a parent by an area covered by one of its children now grabs the child, as a click does.
- **Text Arrange and fit (F.2, F.3, V.1):** in a container, a fitted box that fits the image but sticks out of it slides back inside instead of being cut at the edge, so `fixa` holds every wrapped line and `auto` holds the whole line; a box larger than the image is still cut at the edge. When Arrange leaves the content not fitting, the notice says "Arranged, but the content still does not fit" instead of "Nothing to arrange".
- **Enter in the icon combobox (2.2):** Enter on a picked option that becomes the whole text saves it (disk equals the field); a pick inside a longer text still waits for the next Enter.
- **Focus after a window shortcut (2.1):** closing the Tree or the Catalog by its shortcut returns focus to the canvas, not to the strip button.
- **Test scripts (`docs/TESTING.md`):** R12.48 (leaving the field saves a text with a break; Enter breaks the line, by design), R3.19 (existing commit), R10.1 and R10.10 (what the screen shows); and, after the retest, R12.10c (**Esc** until cleared before each Shift+drag), R12.20c (the `Button` must not contain `Child`), R12.48 (the width follows the widest line) and R12.49 (a text that fits for the `auto` part).

## Alterado

- Fit of a component in a container moves the box back inside the image when it sticks out, instead of keeping the top-left corner and cutting the excess.
