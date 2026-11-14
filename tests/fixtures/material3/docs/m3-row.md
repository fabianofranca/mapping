# Row

Horizontal Compose container: the children line up in order, with spacing and padding.

Annotation type: `m3-row` (Row).

## Size

- Initial: 380 × 48 px
- Minimum: 24 × 24 px
- Sizing: width fill, height hug

## Fields

| Key | Label | Type | Required | Options | Default | Description |
| ------------ | ------------ | ------ | ----------- | ------------------------------------------------------------------------ | ------ | --------- |
| `spacing`    | Spacing (dp) | number | no |                                                                          | 8      |           |
| `padding`    | Padding (dp) | number | no |                                                                          | 0      |           |
| `background` | Background   | enum   | no | none, surface, surface-container, primary-container, secondary-container | none   |           |
| `shape`      | Shape        | enum   | no | none, small, medium, large, extra-large                                  | none   |           |

## Slot

This component has a slot that receives the children.

## Examples

- **Default**: background=none, shape=none, spacing=8, padding=0
- **Primary background**: background=primary-container, shape=none, spacing=8, padding=0
- **Large corners**: background=none, shape=large, spacing=8, padding=0

## External origin

System `sdui`: external type `Row`.

| Field | Path in `props` |
| ------------ | ------------------ |
| `spacing`    | `spacing`          |
| `padding`    | `padding`          |
| `background` | `background`       |
| `shape`      | `shape`            |
