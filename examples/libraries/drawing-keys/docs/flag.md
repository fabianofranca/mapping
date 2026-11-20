# Flag

A small flag drawing (pole, colored banner, dot and label) that exercises the `filter` key of component `formatVersion` 4.

- **`filter.grayscale`:** the root has `filter: { "grayscale": { "$if": { "$eq": ["disabled", "true"] }, "then": 1, "else": 0 } }`. The amount goes from 0 (in color) to 1 (fully gray) and follows the CSS `grayscale()` filter. The filter is drawing only: the layout and the measurement do not change. It reaches the whole subtree, and the drawing of an embedded `component` node too.

Annotation type: `flag` (Flag).

| Field      | Type   | Description                                        |
| ---------- | ------ | -------------------------------------------------- |
| `label`    | string | The flag's text                                    |
| `disabled` | enum   | `false` (in color) or `true` (the flag draws gray) |
