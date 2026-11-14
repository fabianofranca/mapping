# Top app bar

Small top app bar: 64 dp, surface, navigation icon, title-large title and action.

Annotation type: `m3-top-app-bar` (Top app bar).

## Size

- Initial: 412 × 64 px
- Minimum: 200 × 48 px
- Sizing: width fill, height 64

## Fields

| Key | Label | Type | Required | Options | Default | Description |
| ------------ | --------------- | ------ | ----------- | ---------------------------------------------------------------------------------------------------- | ------ | --------- |
| `title`      | Title           | string | yes |                                                                                                      |        |           |
| `navigation` | Navigation icon | enum   | no | home, search, person, menu, more, add, check, back, favorite, edit, notifications, chevron, settings | menu   |           |
| `action`     | Action icon     | enum   | no | home, search, person, menu, more, add, check, back, favorite, edit, notifications, chevron, settings | more   |           |
| `align`      | Title align     | enum   | no | start, center                                                                                        | start  |           |

## Examples

- **Default**: title=Title, navigation=menu, action=more, align=start
- **Centered**: title=Title, navigation=menu, action=more, align=center

## External origin

System `sdui`: external type `TopAppBar`.

| Field | Path in `props` |
| ------------ | ------------------ |
| `title`      | `title`            |
| `navigation` | `navigationIcon`   |
| `action`     | `actionIcon`       |
| `align`      | `titleAlign`       |
