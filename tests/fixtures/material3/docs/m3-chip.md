# Chip

Assist/filter chip: 32 dp, small shape (8), outline; a selected filter on secondary container with a check.

Annotation type: `m3-chip` (Chip).

## Size

- Initial: 96 × 32 px
- Minimum: 40 × 32 px
- Sizing: width hug, height 32

## Fields

| Key | Label | Type | Required | Options | Default | Description |
| ---------- | -------- | ------ | ----------- | ---------------------------------------------------------------------------------------------------- | ------ | --------- |
| `label`    | Label    | string | yes |                                                                                                      |        |           |
| `selected` | Selected | enum   | no | sim, não                                                                                             | não    |           |
| `icon`     | Icon     | enum   | no | home, search, person, menu, more, add, check, back, favorite, edit, notifications, chevron, settings |        |           |

## Examples

- **Default**: label=Label, selected=não
- **Selected**: label=Label, selected=sim

## External origin

System `sdui`: external type `Chip`.

| Field | Path in `props` |
| ---------- | ------------------ |
| `label`    | `text`             |
| `selected` | `selected`         |
| `icon`     | `icon`             |
