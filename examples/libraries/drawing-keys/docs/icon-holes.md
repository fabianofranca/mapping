# Icon holes

A 48 × 48 tile with an icon of the library's icon set (`icons/icons.json`, a `mapping-icons` file in `formatVersion` 3). Each path of the three icons has `"fillRule": "evenodd"`, so the inner shapes are holes: the tile's gray background shows through them in the app, the viewer and the `render_marking` PNG.

- `ring`: two concentric circles in one `d`, both drawn in the same direction. With `nonzero` the inner circle would be filled; with `evenodd` it is a hole.
- `square-hole`: a square with a square hole.
- `star-evenodd`: a self-intersecting five-point star. With `evenodd` its middle is empty, as in SVG.

Annotation type: `icon-holes` (Icon holes).

| Field  | Type   | Description                                               |
| ------ | ------ | --------------------------------------------------------- |
| `icon` | enum   | `ring`, `square-hole` or `star-evenodd`                   |
| `tint` | string | The icon's color (the tile keeps its own gray background) |
