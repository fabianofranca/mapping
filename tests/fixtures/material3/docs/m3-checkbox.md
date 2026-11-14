# Checkbox

18 dp checkbox (shape 2) with a body-large label.

Annotation type: `m3-checkbox` (Checkbox).

## Size

- Initial: 200 × 40 px
- Minimum: 40 × 24 px
- Sizing: width fill, height 40

## Fields

| Key | Label | Type | Required | Options | Default | Description |
| --------- | ------- | ------ | ----------- | -------- | ------ | --------- |
| `label`   | Label   | string | no |          |        |           |
| `checked` | Checked | enum   | no | sim, não | não    |           |
| `error`   | Error   | enum   | no | sim, não | não    |           |

## Examples

- **Default**: label=Label, checked=sim, error=não
- **Unchecked**: label=Label, checked=não, error=não
- **With error**: label=Label, checked=sim, error=sim

## External origin

System `sdui`: external type `Checkbox`.

| Field | Path in `props` |
| --------- | ------------------ |
| `label`   | `label`            |
| `checked` | `checked`          |
| `error`   | `error`            |
