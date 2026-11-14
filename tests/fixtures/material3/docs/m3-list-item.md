# List item

One- or two-line list item: avatar or icon on the left, headline, supporting text and an icon on the right.

Annotation type: `m3-list-item` (List item).

## Size

- Initial: 412 × 72 px
- Minimum: 120 × 48 px
- Sizing: width fill, height 72

## Fields

| Key | Label | Type | Required | Options | Default | Description |
| ------------ | --------------- | ------ | ----------- | ---------------------------------------------------------------------------------------------------- | ------ | --------- |
| `headline`   | Headline        | string | yes |                                                                                                      |        |           |
| `supporting` | Supporting text | string | no |                                                                                                      |        |           |
| `leading`    | Leading icon    | enum   | no | home, search, person, menu, more, add, check, back, favorite, edit, notifications, chevron, settings |        |           |
| `initials`   | Avatar initials | string | no |                                                                                                      |        |           |
| `trailing`   | Trailing icon   | enum   | no | home, search, person, menu, more, add, check, back, favorite, edit, notifications, chevron, settings |        |           |

## Examples

- **Default**: headline=Headline, supporting=Supporting text, leading=person, trailing=chevron

## External origin

System `sdui`: external type `ListItem`.

| Field | Path in `props` |
| ------------ | ------------------ |
| `headline`   | `headline`         |
| `supporting` | `supportingText`   |
| `leading`    | `leadingIcon`      |
| `initials`   | `avatar.initials`  |
| `trailing`   | `trailingIcon`     |
