# Spinner

A loading ring that exercises the arc of component `formatVersion` 4: `startAngle` and `sweepAngle` on an `ellipse`.

- **Arc:** the `arc` node is an `ellipse` with `startAngle: -90` (the top) and `sweepAngle: 216` (60% of the circle, clockwise). It works like Compose's `drawArc` without the center: the stroke follows only the arc, with round caps, and the fill (none here) would close on the chord. The angle is parametric, 0 points right and it grows clockwise; a negative sweep goes counterclockwise, `360` or more is the whole ellipse and `0` draws nothing.
- **Stroke:** `align: "inside"` puts the arc where the whole ellipse's stroke would be, so it lines up with the faint `track` ring under it. No dash computed from the circumference.
- **Sizes:** the `size` field (an enum) picks the box (16, 24 or 40 px, in `sizing`) and the stroke width (2, 3 or 5 px) with a `$switch`.
- **Limit:** drawn as a path, an arc has one shadow, with no `spread` and no inner shadow.

Annotation type: `spinner` (Spinner).

| Field  | Type | Description                                    |
| ------ | ---- | ---------------------------------------------- |
| `size` | enum | `small` (16 px), `medium` (24) or `large` (40) |
