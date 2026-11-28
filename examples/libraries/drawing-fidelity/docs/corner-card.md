# Corner card

A 160 × 96 card whose corners are chosen one by one, with an expression in each item of the `cornerRadius` list (`formatVersion` 4).

- **The list:** `cornerRadius` has four items, in the order top-left, top-right, bottom-right, bottom-left. Each item is a number, a number `$token` or an expression: here a `$switch` that gives 16 for `round` and 0 for `square`.
- **The fields:** `top` drives the first two items and `bottom` the last two, so the card can be round on top and square below (a sheet), or the other way around.
- **A bad result:** an item that resolves to a negative number or to text draws 0 and the drawing warns `invalid value in cornerRadius: <value>`.

Annotation type: `corner-card` (Corner card).

| Field    | Type | Description                                                          |
| -------- | ---- | -------------------------------------------------------------------- |
| `top`    | enum | `round` (16 px) or `square` (0) on the two top corners (`round`)     |
| `bottom` | enum | `round` (16 px) or `square` (0) on the two bottom corners (`square`) |
