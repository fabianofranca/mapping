# Card

A card that reads the library's named values (`tokens` of the specialization, `formatVersion` 23), with two mode axes: `theme` (`light`, `dark`) and `contrast` (`standard`, `high`).

- **Whole composites:** `font` is `{ "$token": "title" }` (size 22, line height 28, a weight that is 500 in `standard` contrast and 700 in `high`) and `shadow` is `{ "$token": "raised" }` (a composite with the keys of a shadow, a darker color in the `dark` theme).
- **Aliases:** the fill is `card-container`, an alias of `surface`; the title uses `ink` and the body `ink-muted`, a derived color (`ink` with alpha 0.6); the outline is `ink` with alpha 0.2. Each follows the theme and the contrast by itself.

Annotation type: `card` (Card).

| Field   | Type   | Description   |
| ------- | ------ | ------------- |
| `title` | string | The title     |
| `body`  | string | The body text |
