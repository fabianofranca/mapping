# Inner shadow

A text field and two round buttons that show the inner shadow of a node's `shadow` in a component (`formatVersion` 4). `"inner": true` draws the shadow inside the shape, like CSS `inset`.

- **Sunken field:** `{ "color": "#00000040", "y": 2, "blur": 4, "inner": true }` shades the inside of the field's top edge. The shadow is clipped by the outline, radii included.
- **Pressed button:** a list of two inner shadows: a soft dark one and a thin light one (`spread: 1`). The first of the list sits on top.
- **Raised button:** an ordinary outer shadow, to compare with the pressed one. Outer and inner shadows mix in the same list, and the limit of 4 counts both.
- **Where it applies:** only `frame`, `rect` and `ellipse`; on any other node `inner` is an error (`shadow.inner: only valid on frame, rect and ellipse`).
- **Offset and spread:** `x` and `y` move the shadow; `spread` makes it thicker (the hole shrinks by `spread` on each side), as in CSS.
- **Order:** fill, inner shadows (the first on top), stroke, children. An inner shadow never enlarges the root's clip.

Annotation type: `inner-shadow` (Inner shadow).

| Field    | Type   | Description                                 |
| -------- | ------ | ------------------------------------------- |
| `text`   | string | The text inside the sunken field (`Search`) |
| `accent` | string | The color of the two buttons (`#2563EB`)    |
