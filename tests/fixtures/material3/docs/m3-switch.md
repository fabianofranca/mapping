# Switch

Switch: 52 × 32 track, 24 (on) or 16 (off) handle; optional label.

Annotation type: `m3-switch` (Switch).

## Size

- Initial: 200 × 32 px
- Minimum: 52 × 32 px
- Sizing: width fill, height 32

## Fields

| Key        | Label    | Type   | Required | Options  | Default | Description |
| ---------- | -------- | ------ | -------- | -------- | ------- | ----------- |
| `label`    | Label    | string | no       |          |         |             |
| `selected` | Selected | enum   | no       | sim, não | não     |             |
| `icon`     | Icon     | enum   | no       | sim, não | não     |             |

## Examples

- **Default**: label=Label, selected=sim, icon=não
- **Off**: label=Label, selected=não, icon=não

## External origin

System `sdui`: external type `Switch`.

| Field      | Path in `props` |
| ---------- | --------------- |
| `label`    | `label`         |
| `selected` | `checked`       |
| `icon`     | `showIcon`      |
