# Divider

A 200 × 16 pill (`cornerRadius` 8) with a 2 px stroke on the bottom side only (`stroke.sides: ["bottom"]`).

- **The stroke follows the radius:** a side's stroke runs along the side and the arcs of its two corners. Next to a side that is not requested the band tapers to 0 at that side's tangent point, like a CSS `border-bottom` on a rounded box. Where both sides of a corner are requested (say `["bottom", "left"]`) the arc keeps the full width.
- **Where it does not apply:** a corner with radius 0 stays a straight end with its `cap`, and a stroke with `dash` or `scale: false` keeps the straight segments.
- **Elevated:** the `elevated` field turns the stroke on (`true`) or off (`false`); the stroke color is an expression.

Annotation type: `divider` (Divider).

| Field      | Type | Description                      |
| ---------- | ---- | -------------------------------- |
| `elevated` | enum | `true` or `false`: the stroke on |
