# Text type in the notes library — [Não lançado] (épico `epic/texto-notas`, MCP 0.45.0, schema v20)

## Adicionado

- **Text type in the notes library (version 5):** `texto`, plain text with no background, border or shadow, for the labels, titles and captions that a mapping needs next to the drawing (the column labels and the title of a design page, for example).
  - Fields: **Text** (required), **Size** (14 when empty), **Weight** (`regular`, `medium`, `semibold`, `bold`), **Color** (free `#RRGGBB`, `#1F1F1F` when empty) and **Width** (`auto`: the box follows the text, one line per typed line; `fixa`: the text wraps at the marking's width and only the height follows). **Arrange** and `fit_marking` follow the mode.
  - It is not floating: it is born on the canvas or inside a container, by geometry, and inside a container it follows the container when it is moved or scaled. **Floating** (or `update_marking` with `floating: true`) puts it above everything.
  - It appears in the Palette and in `create_marking` (`notas/texto`, with or without `container`). On a plain marking, **New annotation** of the Notes layer now offers **Text** (before, it offered nothing: **Note** and **Table** are floating).
- `docs/AGENT-GUIDE.md`: the modeling pattern for the notes library: `notas/texto` for the mapping's own labels and titles, the text type of the screen's library for the text the screen really has.
