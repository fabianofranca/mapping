# Bracket

A bracket drawn on its whole box: an outline on three sides, open on the side the field names. Use it beside a group of rows or items on a documentation page, to say "these belong together".

## Fields

- **Color** (optional): a color token name of an applied library or `#RRGGBB`. Empty, or a name that is not a color, draws `#79747E`.
- **Thickness** (optional): the stroke width, in the units of the component. Empty draws **1**; **0** draws no outline.
- **Style** (optional): `solido` (default) or `tracejado`, a dashed stroke (6 on, 4 off).
- **Open side** (optional): the side with no stroke. `direita` (default) draws `[`, with the left, top and bottom sides; `esquerda` draws `]`; `baixo` and `cima` draw the horizontal brackets. Make the box tall and narrow for `direita` and `esquerda`, wide and short for `baixo` and `cima`.

## Decorative

The bracket is a **decorative** marking: it lives in its space and moves with its container, but it **never contains** other markings, even those drawn inside its box.

## For the agent

Read it with `get_marking`: the values are in the `colchete` annotation and `decorative` is `true`.
