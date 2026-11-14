# Badge

Notification indicator. Small is just a dot; large shows a counter. Anchor it to the corner of an icon.

Annotation type: `badge` (Components layer).

## Fields

| Key     | Label   | Type   | Required | Options          | Default | Description                                                                  |
| ------- | ------- | ------ | -------- | ---------------- | ------- | ---------------------------------------------------------------------------- |
| `count` | Counter | string | no       |                  |         | Counter text (for example 3 or 99+). Only applies in the large style.        |
| `style` | Style   | enum   | no       | `small`, `large` | `small` | small is a dot with no content; large is the counter with the text of count. |

## Compose

- Symbol: `androidx.compose.material3.Badge`
- File (`path`): `compose/material3/material3/src/commonMain/kotlin/androidx/compose/material3/Badge.kt`
- The `style` field chooses the symbol; values without their own case use the base one.

| `style`        | Symbol  |
| -------------- | ------- |
| `small` (base) | `Badge` |
| `large`        | `Badge` |

How the annotation becomes the call (the values below are examples; the parameter names and expressions are those of `params` and `values` in the `code`):

```kotlin
BadgedBox(badge = { Badge { Text("3") } }) {    // style small: badge = { Badge() }
    Icon(Icons.Filled.Notifications, contentDescription = "Notifications")
}
```

Notes from the `code` (what the tool hands to the agent):

> `Badge()` without `content` draws the 6dp dot. The Badge alone does not position itself: to anchor it to the corner of an icon use `BadgedBox(badge = { Badge() }) { Icon(Icons.Filled.Notifications, contentDescription = …) }`, which takes care of the offset. Default colors `error` (background) and `onError` (text); `containerColor` and `contentColor` are only included to change them. Neither Badge nor BadgedBox requires opt-in. Anchored (`anchor`, side `end`, alignment `start`), `BadgedBox` places the dot with its start edge 6 dp from the end edge of the anchor (`BadgeOffset`), at the top of it; the counter, 12 dp (`BadgeWithContentHorizontalOffset`) and 2 dp above the top (14 dp of vertical overlap, `BadgeWithContentVerticalOffset`): for `large`, declare `offset` main -12 and cross -2 on the marking.

`large` variant: `Badge(content = { Text(<count>) })` draws the 16dp counter, which grows with the text (use `99+` for large values). Anchored: `BadgedBox(badge = { Badge { Text(<count>) } }) { Icon(Icons.Filled.Notifications, contentDescription = …) }`. Does not require opt-in. Anchored position: `offset` main -12 and cross -2 (`BadgeWithContentHorizontalOffset` 12 dp and `BadgeWithContentVerticalOffset` 14 dp).

## Examples

- **Dot**: style=small
- **Counter**: count=3, style=large
- **Many items**: count=99+, style=large

## Fidelity

Reference: Compose `material3` 1.4.0, commit `5113b82a4ed6416d6344efa50e41db8cb65928ff` (decisions 1 to 3 of the faithful Material 3 stage). 1 dp = 1 component unit; the container density converts to image pixels (`docs/COMPONENT-FORMAT.md`, "Units and density"). The values come from the specialization tokens (`tokens`, in the `light` and `dark` modes), which mirror the androidx token files; no color, font or radius is literal in the component.

**Files used**

- `compose/material3/material3/src/commonMain/kotlin/androidx/compose/material3/Badge.kt` (lines 150 to 189: `Badge`, a `Row` with `defaultMinSize(size, size)`, background in the shape and, with content, `padding(horizontal = 4.dp)` and the `LargeLabelTextFont` style; 201: `BadgeWithContentHorizontalPadding` 4; 192 to 196: `BadgeDefaults.containerColor`).
- `compose/material3/material3/src/commonMain/kotlin/androidx/compose/material3/tokens/BadgeTokens.kt` (`Size` 6, `LargeSize` 16, `Shape` and `LargeShape` = `CornerFull`, `Color` = `Error`, `LargeLabelTextColor` = `OnError`, `LargeLabelTextFont` = `LabelSmall`).

**How the drawing follows Compose**

- Small: 6 circle in `error`. With a counter: pill 16 tall and at least 16 wide, with 4 of padding on the sides, in `error`, with the `corner-full` shape; it grows with the text (`99+` is wider than one digit, which stays at 16).
- The text uses `label-small-*` (11, weight 500, line 16, spacing 0.5) in `on-error`, in the theme font (`font-sans`), with no `family` in the file.
- In both modes the color comes from the mode's `error` and `on-error` roles.
- Single-line label centered by the capital letter (`cap-middle`): the `number` node uses `font.verticalAlign: "cap-middle"` and stays `hug` in height, because the parent also measures by the text; the text box is the line, centered in the parent. Compose's `Text` centers by the font's line box (ascent and descent); the drawing centers the capital height in the box, and with Roboto the two coincide to within 1 px.

**What still differs from Compose**

- `BadgedBox` itself does not exist: the positioning at the icon corner is the marking's anchor (the root declares `anchor` `end`/`start` with `offset.main` -6, the dot's `BadgeOffset`, and Snap to anchor puts it at the icon corner). For the counter (`large`), `BadgedBox` uses 12 (`BadgeWithContentHorizontalOffset`) and 14 of vertical overlap (`BadgeWithContentVerticalOffset`): declare `offset` main -12 and cross -2 on the marking, because the root default is a single one and the dot's applies (`small`, the type's default). The limit of `BadgeEndRuler`/`BadgeTopRuler` (the badge pinned to the window) is not drawn.
- No counter text limit like Compose's (the caller truncates, for example `99+`).
- The counter height is that of the text (`hug`), with the minimum of 16 (`minHeight`), like Compose's `defaultMinSize`: the library's drawing check measures the text with the size and line of the mode's token (`label-small-line-height`, 16), so it does not warn.
