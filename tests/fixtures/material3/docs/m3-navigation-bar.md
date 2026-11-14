# Navigation bar

80 dp navigation bar with three destinations; 64 × 32 active indicator on secondary container.

Annotation type: `m3-navigation-bar` (Navigation bar).

## Size

- Initial: 412 × 80 px
- Minimum: 240 × 64 px
- Sizing: width fill, height 80

## Fields

| Key | Label | Type | Required | Options | Default | Description |
| -------- | ------- | ------ | ----------- | ---------------------------------------------------------------------------------------------------- | ------ | --------- |
| `label1` | Label 1 | string | yes |                                                                                                      |        |           |
| `icon1`  | Icon 1  | enum   | no | home, search, person, menu, more, add, check, back, favorite, edit, notifications, chevron, settings | home   |           |
| `label2` | Label 2 | string | yes |                                                                                                      |        |           |
| `icon2`  | Icon 2  | enum   | no | home, search, person, menu, more, add, check, back, favorite, edit, notifications, chevron, settings | search |           |
| `label3` | Label 3 | string | yes |                                                                                                      |        |           |
| `icon3`  | Icon 3  | enum   | no | home, search, person, menu, more, add, check, back, favorite, edit, notifications, chevron, settings | person |           |
| `active` | Active  | enum   | no | 1, 2, 3                                                                                              | 1      |           |

## Examples

- **Default**: label1=Home, icon1=home, label2=Search, icon2=search, label3=Profile, icon3=person, active=1
- **Second tab active**: label1=Home, icon1=home, label2=Search, icon2=search, label3=Profile, icon3=person, active=2
- **Third tab active**: label1=Home, icon1=home, label2=Search, icon2=search, label3=Profile, icon3=person, active=3

## External origin

System `sdui`: external type `NavigationBar`.

| Field | Path in `props` |
| -------- | ------------------ |
| `label1` | `items[0].label`   |
| `icon1`  | `items[0].icon`    |
| `label2` | `items[1].label`   |
| `icon2`  | `items[1].icon`    |
| `label3` | `items[2].label`   |
| `icon3`  | `items[2].icon`    |
| `active` | `selectedIndex`    |
