# Icon button

A 40 × 40 button built by composition: three `component` nodes draw the `glyph`, the `spinner` and the `badge` of this library.

- `state` `loading` hides the glyph and shows the spinner (`size` `medium`). The button passes its content color with `provide: { "content-color": … }`, and the spinner paints its ring with it, not with its own `color` field.
- `showBadge` `yes` shows the badge, anchored to the button's top-end corner with `anchors`; its text is `values.count`, copied from the button's `count` field.

Annotation type: `icon-button` (Icon button).

| Field       | Type   | Description                 |
| ----------- | ------ | --------------------------- |
| `state`     | enum   | `default` or `loading`      |
| `showBadge` | enum   | `no` or `yes`               |
| `count`     | string | The badge text (`3`, `99+`) |
