# Photo

A 160 × 96 box with the package image `images/photo.png` (96 × 48 px, four flat-color quadrants: red, green, blue and amber), drawn with the fit of the `fit` field.

- **`fit` by expression:** the `image` node's `fit` is `{ "$field": "fit", "default": "cover" }` (`formatVersion` 4). Any expression that gives one of the fits works, a `$switch` included.
- **The four fits of the field:** `cover` fills the box and crops, `contain` shows the whole image, `fill` stretches it to the box and `none` keeps its own size, centered.
- **A bad result:** a value that is not a fit draws `cover` and the drawing warns `invalid value in image.fit: <value>`.

Annotation type: `photo` (Photo).

| Field | Type | Description                                    |
| ----- | ---- | ---------------------------------------------- |
| `fit` | enum | `cover`, `contain`, `fill` or `none` (`cover`) |
