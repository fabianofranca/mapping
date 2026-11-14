# Bottom sheet

Modal sheet: logo, title, caption and footer. The caption sits at the top of the box, the footer at the bottom, and the footer row aligns to the end.

Annotation type: `sdui-sheet` (Bottom sheet).

## Size

- Initial: 412 × 220 px
- Minimum: 240 × 200 px
- Sizing: width fill, height 220

## Fields

| Key        | Label    | Type   | Required | Options | Default |
| ---------- | -------- | ------ | -------- | ------- | ------- |
| `title`    | Title    | string | yes      |         |         |
| `subtitle` | Subtitle | string | no       |         |         |
| `footer`   | Footer   | string | no       |         |         |

## Examples

- **Sort**: title=Sort by, subtitle=Choose the list order, footer=Cancel

## External origin

- System `sdui`: external type `BottomSheet`

| Field      | Path in `props` |
| ---------- | --------------- |
| `title`    | `title`         |
| `subtitle` | `subtitle`      |
| `footer`   | `footer`        |
