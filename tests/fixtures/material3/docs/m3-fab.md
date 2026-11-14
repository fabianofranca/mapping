# FAB

Floating action button: 56 dp, large shape (16), primary container; extended with a label.

Annotation type: `m3-fab` (FAB).

## Size

- Initial: 56 × 56 px
- Minimum: 40 × 40 px
- Sizing: width 56, height 56

## Fields

| Key     | Label            | Type   | Required | Options                                                                                              | Default | Description |
| ------- | ---------------- | ------ | -------- | ---------------------------------------------------------------------------------------------------- | ------- | ----------- |
| `icon`  | Icon             | enum   | no       | home, search, person, menu, more, add, check, back, favorite, edit, notifications, chevron, settings | add     |             |
| `label` | Label (extended) | string | no       |                                                                                                      |         |             |
| `color` | Color            | enum   | no       | primary, secondary, surface                                                                          | primary |             |

## Examples

- **Default**: icon=add, color=primary
- **Secondary**: icon=add, color=secondary
- **Surface**: icon=add, color=surface

## External origin

System `sdui`: external type `FAB`.

| Field   | Path in `props` |
| ------- | --------------- |
| `icon`  | `icon`          |
| `label` | `label`         |
| `color` | `color`         |
