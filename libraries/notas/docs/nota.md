# Note

A sticky note on the canvas, for what does not fit in a layer annotation: a comment about a screen, a business rule, the properties of an analytics event, the parameters of a call, a message for whoever will read the mapping. It carries a title, a text, a table of rows and a second text, and each part shows only when it has a value.

## Fields

- **Title** (optional): the summary, in bold at the top of the sticky note (the event name, for example).
- **Text** (optional): the comment, drawn under the title. Accepts multiple lines: Shift+Enter breaks the line (Enter confirms while the field is a single line; in the multi-line area, Enter also inserts a line).
- **Rows** (optional): one row per record, with the **Key** (required) and the **Value**, the key on the left and the value on the right. The order of the rows is the drawing order; drag a row's handle to reorder. Use it for what is a list of data and does not fit in a text.
- **Text after** (optional): a second text, drawn under the rows (a remark about the table, a source).
- **Color** (optional): `yellow`, `blue`, `green`, `pink`, `orange` or `gray`. The fill and the text go together. Empty draws `yellow`.

The parts are drawn in this order: title, text, rows, text after. A part with no value is not drawn and takes no room, so a note with only rows is just the table.

## How the note behaves

- It is a **floating** marking: it lives only on the canvas, is drawn above everything (including photos) and never belongs to a screen or to another marking.
- It carries nothing and nothing carries it: moving a screen does not move the notes that are over it. To move everything together, select with Shift+click or use "Select with contents" on a marking of the canvas around them.
- The relation of the note to a screen or an element is an **arrow**, not a field: pull an arrow from the note (or from the element) to the marking of the button, the field or the screen. The data stays in the note; whoever reads the mapping reaches it through the arrows that leave the element. A table of data goes beside the screen it describes and is linked to it by an arrow.
- The height does not grow on its own with the rows: if the note exceeds the box, the drawing is clipped and the marking gets the pending item that the component does not fit. Enlarge the marking.

## Migration from the Table

Version 5 and earlier had a separate **Table** type. Updating the library turns every table into a yellow note with the same title and rows.

## For the agent

Read the note with `get_marking`: the values of the `nota` annotation hold `titulo`, `texto`, `linhas` (rows with `chave` and `valor`), `textoDepois` and `cor`, and `floating` is `true`. To know which element it talks about, look at the marking's arrows, in `arrows`. To create a table, do `create_marking` on the canvas (with `near` to sit beside the container), an annotation of the `nota` type with the `linhas`, and link it to the target with `create_arrow`. A note is a human comment or auxiliary data: use it as context, not as an interface specification.
