# Bottom sheet

Modal bottom sheet: surface-container-low, extra-large top corners (28), a 32 × 4 handle 22 dp from the top, a title and list items.

Annotation type: `m3-bottom-sheet` (Bottom sheet).

## Size

- Initial: 412 × 320 px
- Minimum: 240 × 96 px
- Sizing: width fill, height hug

## Fields

| Key      | Label       | Type   | Required | Options                                                                                              | Default | Description |
| -------- | ----------- | ------ | -------- | ---------------------------------------------------------------------------------------------------- | ------- | ----------- |
| `title`  | Title       | string | no       |                                                                                                      |         |             |
| `handle` | Drag handle | enum   | no       | sim, não                                                                                             | sim     |             |
| `item1`  | Item 1      | string | no       |                                                                                                      |         |             |
| `icon1`  | Icon 1      | enum   | no       | home, search, person, menu, more, add, check, back, favorite, edit, notifications, chevron, settings |         |             |
| `item2`  | Item 2      | string | no       |                                                                                                      |         |             |
| `icon2`  | Icon 2      | enum   | no       | home, search, person, menu, more, add, check, back, favorite, edit, notifications, chevron, settings |         |             |
| `item3`  | Item 3      | string | no       |                                                                                                      |         |             |
| `icon3`  | Icon 3      | enum   | no       | home, search, person, menu, more, add, check, back, favorite, edit, notifications, chevron, settings |         |             |

## Examples

- **Default**: title=Title, handle=sim, item1=Item one, icon1=favorite, item2=Item two, icon2=edit, item3=Item three, icon3=settings
- **No handle**: title=Title, handle=não, item1=Item one, icon1=favorite, item2=Item two, icon2=edit, item3=Item three, icon3=settings

## External origin

System `sdui`: external type `BottomSheet`.

| Field    | Path in `props`  |
| -------- | ---------------- |
| `title`  | `title`          |
| `handle` | `dragHandle`     |
| `item1`  | `items[0].label` |
| `icon1`  | `items[0].icon`  |
| `item2`  | `items[1].label` |
| `icon2`  | `items[1].icon`  |
| `item3`  | `items[2].label` |
| `icon3`  | `items[2].icon`  |
