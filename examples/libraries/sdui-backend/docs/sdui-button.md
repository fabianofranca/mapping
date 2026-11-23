# Button

Button with four variants. The mode changes the label decoration: underlined in the link and struck through in the deprecated button.

Annotation type: `sdui-button` (Button).

## Size

- Initial: 120 × 40 px
- Minimum: 64 × 40 px
- Sizing: width hug, height 40

## Fields

| Key        | Label    | Type   | Required | Options                       | Default |
| ---------- | -------- | ------ | -------- | ----------------------------- | ------- |
| `label`    | Label    | string | yes      |                               |         |
| `variant`  | Variant  | enum   | no       | filled, tonal, outlined, text | filled  |
| `mode`     | Mode     | enum   | no       | normal, link, deprecated      | normal  |
| `disabled` | Disabled | enum   | no       | yes, no                       | no      |

## Examples

- **Default**: label=Label, variant=filled, mode=normal, disabled=no
- **Link**: label=Label, variant=text, mode=link, disabled=no

## External origin

- System `sdui`: external type `Button`
- System `figma`: external type `DS/Button`

| Field      | Path in `props` |
| ---------- | --------------- |
| `label`    | `text`          |
| `variant`  | `style`         |
| `mode`     | `mode`          |
| `disabled` | `disabled`      |
