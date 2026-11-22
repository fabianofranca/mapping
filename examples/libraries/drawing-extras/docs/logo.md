# Logo

Three images of the library package drawn by `image` nodes (`formatVersion` 4). The images are files of the package (`images/`), copied with the library: they need no network and no consent.

- **Fixed:** `"src": "images/logo.png"` is a literal package path (relative to the specialization file's folder, with `/`, ending in `.png`, `.jpg`, `.jpeg` or `.webp`). It is drawn with `fit: "cover"`.
- **Chosen by the variant:** `src` is a `$switch` over the `variant` field whose every result is a literal package path (`png` to `images/logo.png`, `jpeg` to `images/photo.jpg`, `webp` to `images/pattern.webp`, with a `default`). It is drawn with `fit: "contain"` and a `cornerRadius` of 40, a circle.
- **Named by a field:** `src` is `{ "$field": "source" }`. A value that is a package path draws that image; an `https://` value would draw the remote image (with consent) and anything else draws the placeholder.

The package images are 96 x 96 px, each with four flat-color quadrants (top left, top right, bottom left, bottom right), so a drawing can be checked by its pixels:

| Image                 | Format | Top left  | Top right | Bottom left | Bottom right |
| --------------------- | ------ | --------- | --------- | ----------- | ------------ |
| `images/logo.png`     | PNG    | `#E53935` | `#43A047` | `#1E88E5`   | `#FDD835`    |
| `images/photo.jpg`    | JPEG   | `#8E24AA` | `#00ACC1` | `#FB8C00`   | `#6D4C41`    |
| `images/pattern.webp` | WebP   | `#212121` | `#F5F5F5` | `#F06292`   | `#26A69A`    |

The JPEG is lossy, so its decoded pixels are close to these values, not exact. The validator checks that each cited image exists, that its content matches its extension, and that it is at most 1 MB and 2048 px on each side.

Annotation type: `logo` (Logo).

| Field     | Type   | Description                                                     |
| --------- | ------ | --------------------------------------------------------------- |
| `variant` | enum   | `png`, `jpeg` or `webp`: the image of the middle slot (`png`)   |
| `source`  | string | A package image path drawn in the last slot (`images/logo.png`) |
