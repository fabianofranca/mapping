# Button

Common button: filled, tonal, outlined, text or elevated; 40 dp, full shape.

Annotation type: `m3-button` (Button).

## Size

- Initial: 120 × 40 px
- Minimum: 48 × 40 px
- Sizing: width hug, height 40

## Fields

| Key | Label | Type | Required | Options | Default | Description |
| ---------- | -------- | ------ | ----------- | ---------------------------------------------------------------------------------------------------- | ------ | --------- |
| `label`    | Label    | string | yes |                                                                                                      |        |           |
| `variant`  | Variant  | enum   | no | filled, tonal, outlined, text, elevated                                                              | filled |           |
| `icon`     | Icon     | enum   | no | home, search, person, menu, more, add, check, back, favorite, edit, notifications, chevron, settings |        |           |
| `disabled` | Disabled | enum   | no | sim, não                                                                                             | não    |           |

## Examples

- **Default**: label=Label, variant=filled, disabled=não
- **Tonal**: label=Label, variant=tonal, disabled=não
- **Outlined**: label=Label, variant=outlined, disabled=não

## External origin

System `sdui`: external type `Button`.

- Ignored props: `contentDescription`

| Field | Path in `props` |
| ---------- | ------------------ |
| `label`    | `text`             |
| `variant`  | `style`            |
| `icon`     | `icon`             |
| `disabled` | `disabled`         |
