# Note

A sticky note on the canvas, for what does not fit in a layer annotation: a comment about a screen, a business rule, a message for whoever will read the mapping.

## Fields

- **Title** (optional): the summary, in bold at the top of the sticky note.
- **Text** (required): the comment. Accepts multiple lines: Shift+Enter breaks the line (Enter confirms while the field is a single line; in the multi-line area, Enter also inserts a line).

## How the note behaves

- It is a **floating** marking: it lives only on the canvas, is drawn above everything (including photos) and never belongs to a screen or to another marking.
- It carries nothing and nothing carries it: moving a screen does not move the notes that are over it. To move everything together, select with Shift+click or use "Select with contents" on a marking of the canvas around them.
- The relation of the note to a screen or an element is an **arrow** (next stage); for now, place the note beside what it comments on.

## For the agent

Read the note with `get_marking`: the title and the text are in the values of the `nota` annotation, and `floating` is `true`. A note is a human comment: use it as context, not as an interface specification.
