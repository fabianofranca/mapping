# Table

A key-value table on the canvas, in the sticky-note style, for what is a list of data and does not fit in a text: the properties of an analytics event, the parameters of a call, the fields a screen shows.

## Fields

- **Title** (optional): the summary, in bold at the top (the event name, for example).
- **Rows**: one row per record, with the **Key** (required) and the **Value**. The order of the rows is the drawing order; drag a row's handle to reorder.

## How the table behaves

- It is a **floating** marking, like the note: it lives only on the canvas, is drawn above everything and never belongs to a screen or to another marking. Moving a screen does not move the tables beside it.
- The link to what the table describes is an **arrow**, not a field: pull an arrow from the table (or from the element) to the marking of the button, the field or the screen. The data stays in the table; whoever reads the mapping reaches it through the arrows that leave the element.
- The height does not grow on its own with the rows: if the table exceeds the box, the drawing is clipped and the marking gets the pending item that the component does not fit. Enlarge the marking.

## For the agent

Read the table with `get_marking`: the title and the rows (`chave` and `valor`) are in the values of the `tabela` annotation, and `floating` is `true`. To know which element it talks about, look at the marking's arrows, in `arrows`. To create one, do `create_marking` on the canvas (with `near` to sit beside the container), an annotation of the `tabela` type with the `linhas`, and link it to the target with `create_arrow`. A table is a human comment or auxiliary data: use it as context, not as an interface specification.
