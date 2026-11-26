# Brand badge

A square tile (48 × 48) with the `brand` icon of the package icon set (`icons/icons.json`, `formatVersion` 4, a 24 × 24 `viewBox`) drawn at 48 × 48:

- the first path is a linear gradient from red (`#FF0000`) to blue (`#0000FF`), with `from` `[0, 0]` and `to` `[24, 0]`, in `viewBox` units;
- the second path is a small square with a radial gradient, white to black, centered, with a radius of 4 `viewBox` units;
- the icon's `clip` is a circle of radius 12 at the center, so the corners of the tile show the tile color.

The node's `color` does not tint a gradient.

Annotation type: `brand-badge` (Brand badge). Field: `tint` (text, default `#FFFFFF`), the tile color.
