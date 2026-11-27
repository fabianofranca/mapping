# Line

A straight line through the middle of its box, along its whole width or height. Use it as a divider between the sections of a documentation page.

## Fields

- **Color** (optional): a color token name of an applied library or `#RRGGBB`. Empty, or a name that is not a color, draws `#79747E`.
- **Thickness** (optional): the stroke width, in the units of the component. Empty draws **1**; **0** draws nothing.
- **Style** (optional): `solido` (default) or `tracejado`, a dashed stroke (6 on, 4 off).
- **Orientation** (optional): `horizontal` (default) runs along the whole width; `vertical` along the whole height. Make the box thin on the other axis.

## Decorative

The line is a **decorative** marking: it lives in its space and moves with its container, but it **never contains** other markings. Dragging it over a sample does not make the sample its child.

## For the agent

Read it with `get_marking`: the values are in the `linha` annotation and `decorative` is `true`.
