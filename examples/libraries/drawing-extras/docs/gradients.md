# Gradients

Swatches that show the three gradient types of a node's `fill` in a component (`formatVersion` 4). The first swatch changes type with the `kind` field; the other three always draw one type each, so the types can be compared side by side.

- **Radial:** `{ "type": "radial", "center": [0.5, 0.5], "radius": 36, "stops": [...] }` draws a circle. `center` is a pair of fractions of the box (default the middle), `radius` is in pixels (default half of the smaller side) and the last color continues beyond the radius.
- **Angular:** `{ "type": "angular", "center": [0.5, 0.5], "angle": 0, "stops": [...] }` sweeps clockwise around `center`, starting at `angle` degrees (0 is to the right).
- **Linear:** `{ "type": "linear", "angle": 90, "stops": [...] }`, where 0 runs left to right and 90 runs top to bottom.
- **Gradient from an expression:** the main swatch's `fill` is a `$switch` on `kind` whose cases are whole gradients. The stop colors are `{ "$field": "from" }` and `{ "$field": "to" }`, so the colors follow the annotation.

Annotation type: `gradients` (Gradients).

| Field  | Type   | Description                                      |
| ------ | ------ | ------------------------------------------------ |
| `kind` | enum   | `radial`, `angular` or `linear`: the main swatch |
| `from` | string | The first color of every gradient (`#F59E0B`)    |
| `to`   | string | The last color of every gradient (`#7C3AED`)     |
