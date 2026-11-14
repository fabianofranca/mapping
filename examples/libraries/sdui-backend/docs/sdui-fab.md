# FAB

Floating action button of 56 px, with the plus or the ring icon. The ring uses the even-odd fill rule.

Annotation type: `sdui-fab` (FAB).

## Size

- Initial: 56 × 56 px
- Minimum: 40 × 40 px
- Sizing: width 56, height 56

## Fields

| Key     | Label | Type | Required | Options            | Default |
| ------- | ----- | ---- | -------- | ------------------ | ------- |
| `icon`  | Icon  | enum | no       | add, ring          | add     |
| `color` | Color | enum | yes      | primary, secondary | primary |

## Examples

- **Plus**: icon=add, color=primary
- **Ring**: icon=ring, color=secondary

## External origin

- System `sdui`: external type `FAB`

| Field   | Path in `props` |
| ------- | --------------- |
| `icon`  | `icon`          |
| `color` | `color`         |
