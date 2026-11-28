# Link

A text link with a focus ring. The ring is a `rect` that fills the link, with radius 0, and a stroke `{ "align": "inside", "width": 2, "offset": 2, "cornerRadius": 4 }`.

- **The stroke's own radius:** `stroke.cornerRadius` is the radius of the outline the stroke is drawn on (the shape grown by `offset`). It replaces "the node's radius plus `offset`", and `align` is relative to it: here the ring is 4 px round on its outer edge and 2 px round on its inner edge (`4 − width`). The fill, the clip and the shadows keep the node's radius, 0.
- **Where it applies:** the whole outline, the `sides` and the `gap`. Only `frame` and `rect` accept it; on an `ellipse` or a `path` it is an error at the key.
- **Focused:** the `focused` field shows the ring (`true`) or hides it (`false`); the stroke color is an expression.

Annotation type: `link` (Link).

| Field     | Type | Description                    |
| --------- | ---- | ------------------------------ |
| `focused` | enum | `true` or `false`: the ring on |
