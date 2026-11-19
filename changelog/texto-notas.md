# Text type in the notes library — [Não lançado] (PR #0, épico `epic/texto-notas`, MCP 0.45.0, schema v21)

## Adicionado

- **Text type in the notes library (version 5):** `texto`, plain text with no background, border or shadow, for the labels, titles and captions that a mapping needs next to the drawing (the column labels and the title of a design page, for example).
  - Fields: **Text** (required), **Size** (14 when empty), **Weight** (`regular`, `medium`, `semibold`, `bold`), **Color** (free `#RRGGBB`, `#1F1F1F` when empty) and **Width** (`auto`: the box follows the text, one line per typed line; `fixa`: the text wraps at the marking's width and only the height follows). **Arrange** and `fit_marking` follow the mode.
  - It is not floating: it is born on the canvas or inside a container, by geometry, and inside a container it follows the container when it is moved or scaled. **Floating** (or `update_marking` with `floating: true`) puts it above everything.
  - It appears in the Palette and in `create_marking` (`notas/texto`, with or without `container`). On a plain marking, **New annotation** of the Notes layer now offers **Text** (before, it offered nothing: **Note** and **Table** are floating). Projects that already have the notes library at version 4 keep it until the library is updated (the update path comes with the next phase of the stage).
- `docs/AGENT-GUIDE.md`: the modeling pattern for the notes library: `notas/texto` for the mapping's own labels and titles, the text type of the screen's library for the text the screen really has.
- Tests: the ceiling of the generated guide of each block of the full round (`MAX_BLOCK_GUIDE_CHARS`) went from 201,000 to 207,000 characters: R12.45 to R12.53 took block 3 to 207.0 thousand.
- MCP: the `type` of the operations resolves `specId/typeId`, then the type `id`, then the name (before, all three were mixed): the name "Text" of `notas/texto` does not make the id `text` of another library ambiguous.
