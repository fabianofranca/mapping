# Tag

A small label that reads its measures from the library's design tokens (`tokens` of the specialization, two drawing modes: `compact` and `comfortable`). It exercises three keys of component `formatVersion` 4.

- **Letter spacing in percent:** `font.letterSpacing` is a `$switch` by the `spacing` field whose results are the texts `"-1%"`, `"4%"` and `"8%"`. The engine resolves each as a share of the font size: 4% of 12 px is 0.48 px. A literal `"2%"` or `"-1.5%"` works the same way. (A token holds a number, a color or a font family, so the percent text stays literal or comes from an expression.)
- **Padding items from tokens:** the row's `padding` is `[0, { "$token": "tag-padding" }]`: no vertical padding and a horizontal one that follows the mode. Each item of a 2- or 4-item list can be a number, a token or any number expression.
- **`sizing` from a token:** the height is `{ "$token": "tag-height" }` (20 in `compact`, 28 in `comfortable`) and the width hugs the label. `fit_marking` and the app's fit follow the token of the marking's drawing mode.

Annotation type: `tag` (Tag).

| Field     | Type   | Description                                 |
| --------- | ------ | ------------------------------------------- |
| `label`   | string | The tag's text                              |
| `tone`    | enum   | `info` (blue) or `success` (green)          |
| `spacing` | enum   | `tight` (-1%), `normal` (4%) or `wide` (8%) |
