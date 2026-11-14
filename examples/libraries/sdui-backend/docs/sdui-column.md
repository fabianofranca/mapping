# Column

Vertical container: the children stack in order, with spacing and padding.

Annotation type: `sdui-column` (Column).

## Size

- Initial: 380 × 200 px
- Minimum: 24 × 24 px
- Sizing: width fill, height hug

## Fields

| Key       | Label   | Type   | Required | Options | Default |
| --------- | ------- | ------ | -------- | ------- | ------- |
| `spacing` | Spacing | number | no       |         | 8       |
| `padding` | Padding | number | no       |         | 0       |

## Slot

This component has a slot that receives the children (`content`).

## Examples

- **Default**: spacing=8, padding=0
- **Spaced**: spacing=16, padding=16

## External origin

- System `sdui`: external type `Column`, slot `content`

| Field     | Path in `props` |
| --------- | --------------- |
| `spacing` | `spacing`       |
| `padding` | `padding`       |
