# Box

Free-form Compose container: the children stay where their own rectangle says.

Annotation type: `m3-box` (Box).

## Size

- Initial: 200 × 120 px
- Minimum: 24 × 24 px
- Sizing: width fill, height hug

## Fields

| Key | Label | Type | Required | Options | Default | Description |
| ------------ | ---------- | ---- | ----------- | ------------------------------------------------------------------------ | ------ | --------- |
| `background` | Background | enum | no | none, surface, surface-container, primary-container, secondary-container | none   |           |
| `shape`      | Shape      | enum | no | none, small, medium, large, extra-large                                  | none   |           |

## Slot

This component has a slot that receives the children.

## Examples

- **Default**: background=none, shape=none
- **Primary background**: background=primary-container, shape=none
- **Large corners**: background=none, shape=large

## External origin

System `sdui`: external type `Box`.

| Field | Path in `props` |
| ------------ | ------------------ |
| `background` | `background`       |
| `shape`      | `shape`            |
