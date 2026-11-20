# Pressed button

A button that shrinks a little when pressed. It exercises the `scale` key of component `formatVersion` 4.

- **`scale`:** the template root has `scale: { "$if": { "$eq": ["state", "pressed"] }, "then": 0.96, "else": 1 }`. The drawing scales uniformly around the center of the node's box; the box, the layout and the measurement do not change (drawing only, like `rotation`). A number from 0 up, an expression or a `$token`; 0 draws nothing.
- **Composition:** the Flag is an embedded `component` node, so its drawing scales along with the root (the outer scale composes with the node's own).

Annotation type: `pressed-button` (Pressed button).

| Field   | Type   | Description                                         |
| ------- | ------ | --------------------------------------------------- |
| `label` | string | The button's text                                   |
| `state` | enum   | `default` (full size) or `pressed` (scaled to 0.96) |
