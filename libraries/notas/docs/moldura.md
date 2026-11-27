# Frame

A rectangular frame drawn on its whole box: an outline on the four sides and, when asked, a fill. Use it to group a region of a documentation page (a grid of samples, a section) or, filled, as a background that sits behind the samples.

## Fields

- **Color** (optional): the color of the outline, the name of a **color token** of an applied library (such as `outline`, so the frame follows the theme) or a literal color as `#RRGGBB`. Empty, or a name that is not a color, draws `#79747E`.
- **Thickness** (optional): the stroke width, in the units of the component. Empty draws **1**; **0** draws no outline at all.
- **Style** (optional): `solido` (default) or `tracejado`, a dashed stroke (6 on, 4 off).
- **Radius** (optional): the corner radius. Empty draws 0.
- **Fill** (optional): the fill of the box, a color token name or `#RRGGBB`. Empty, or a name that is not a color, draws no fill.

## Decorative

The frame is a **decorative** marking: it lives in its space (inside a container, in the container's pixels and moving with it, or on the canvas) but it **never contains** other markings. A sample drawn inside the frame stays a child of whatever contains the frame, so moving that container moves the frame and the samples together, and clicking a sample selects the sample, not the frame.

It is born at the back, below its siblings. A frame with **Fill** and **Thickness** `0` is a plain background: draw it first and the samples sit on its color instead of the container's.

## For the agent

Read it with `get_marking`: the values are in the `moldura` annotation and `decorative` is `true`. Create it with `create_marking` and the annotation of the type; it is born decorative and at the back.
