# Text field

Outlined text field: 56 dp box, extra-small shape (4), floating label and supporting text.

Annotation type: `m3-text-field` (Text field).

## Size

- Initial: 280 × 80 px
- Minimum: 120 × 56 px
- Sizing: width fill, height 56

## Fields

| Key | Label | Type | Required | Options | Default | Description |
| ------------- | --------------- | ------ | ----------- | ---------------------------------------------------------------------------------------------------- | ------- | --------- |
| `label`       | Label           | string | yes |                                                                                                      |         |           |
| `value`       | Input text      | string | no |                                                                                                      |         |           |
| `placeholder` | Placeholder     | string | no |                                                                                                      |         |           |
| `supporting`  | Supporting text | string | no |                                                                                                      |         |           |
| `state`       | State           | enum   | no | enabled, focused, error, disabled                                                                    | enabled |           |
| `trailing`    | Trailing icon   | enum   | no | home, search, person, menu, more, add, check, back, favorite, edit, notifications, chevron, settings |         |           |

## Examples

- **Default**: label=Label, value=Input text, supporting=Supporting text, state=enabled
- **Focused**: label=Label, value=Input text, supporting=Supporting text, state=focused
- **With error**: label=Label, value=Input text, supporting=Supporting text, state=error

## External origin

System `sdui`: external type `TextField`.

| Field | Path in `props` |
| ------------- | ------------------ |
| `label`       | `label`            |
| `value`       | `value`            |
| `placeholder` | `placeholder`      |
| `supporting`  | `supportingText`   |
| `state`       | `state`            |
| `trailing`    | `trailingIcon`     |
