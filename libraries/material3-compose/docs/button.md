# Button

Action button. Filled is high emphasis, tonal and elevated medium, outlined and text low.

Annotation type: `button` (Components layer).

## Fields

| Key           | Label       | Type   | Required | Options                                                   | Default  | Description                                                                                                                                                                                            |
| ------------- | ----------- | ------ | -------- | --------------------------------------------------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `label`       | Label       | string | yes      |                                                           |          | Button text.                                                                                                                                                                                           |
| `style`       | Style       | enum   | no       | `filled`, `tonal`, `outlined`, `text`, `elevated`         | `filled` | filled (Button), tonal (FilledTonalButton), outlined, text or elevated.                                                                                                                                |
| `enabled`     | Enabled     | enum   | no       | `true`, `false`                                           | `true`   | false disables the button.                                                                                                                                                                             |
| `interaction` | Interaction | enum   | no       | `none`, `hovered`, `focused`, `pressed`                   | `none`   | Still appearance of the interaction state: hovered, focused or pressed; none = no state layer. Only changes the drawing, does not enter the code. With enabled false it draws nothing (disabled wins). |
| `icon`        | Icon        | string | no       | free text; icon suggestions (`Home`, `Search`, `Person`…) |          | Icon before the text. Empty = text only.                                                                                                                                                               |
| `width`       | Width       | enum   | no       | `wrap`, `fill`, `fixed`                                   | `wrap`   | wrap fits the content, fill takes all the available width and fixed uses the marking width (dp).                                                                                                       |
| `height`      | Height      | enum   | no       | `wrap`, `fill`, `fixed`                                   | `wrap`   | wrap fits the content, fill takes all the available height and fixed uses the marking height (dp).                                                                                                     |
| `weight`      | Weight      | number | no       |                                                           |          | Share of the leftover space in a Row or Column (Modifier.weight). Empty = no weight.                                                                                                                   |

## Compose

- Symbol: `androidx.compose.material3.Button`
- File (`path`): `compose/material3/material3/src/commonMain/kotlin/androidx/compose/material3/Button.kt`
- The `style` field chooses the symbol; values without their own case use the base one.

| `style`         | Symbol              |
| --------------- | ------------------- |
| `filled` (base) | `Button`            |
| `tonal`         | `FilledTonalButton` |
| `outlined`      | `OutlinedButton`    |
| `text`          | `TextButton`        |
| `elevated`      | `ElevatedButton`    |

How the annotation becomes the call (the values below are examples; the parameter names and expressions are those of `params` and `values` in the `code`):

```kotlin
Button(    // style tonal: FilledTonalButton, outlined: OutlinedButton, text: TextButton, elevated: ElevatedButton
    onClick = { /* screen logic */ },
    enabled = true,
    modifier = Modifier.fillMaxWidth(),    // width = fill
) {
    Icon(Icons.Filled.Add, contentDescription = null, Modifier.size(ButtonDefaults.IconSize))   // only with icon
    Spacer(Modifier.size(ButtonDefaults.IconSpacing))
    Text("Add")
}
```

Notes from the `code` (what the tool hands to the agent):

> `onClick` connects to the screen logic and the text goes in `content = { Text(<label>) }`. With `icon` filled in, put `Icon(Icons.Filled.<icon>, contentDescription = null, Modifier.size(ButtonDefaults.IconSize))` and `Spacer(Modifier.size(ButtonDefaults.IconSpacing))` before the text. Size: `fill` becomes `Modifier.fillMaxWidth()`/`fillMaxHeight()`, `fixed` becomes `Modifier.width(<marking width>.dp)`/`height(<marking height>.dp)` and `weight` becomes `Modifier.weight(<weight>f)` (only inside Row, Column or FlowRow).

## Examples

- **Filled**: label=Save, style=filled
- **Outlined**: label=Cancel, style=outlined
- **With icon**: label=Add, style=tonal, icon=Add
- **Hovered**: label=Save, style=filled, interaction=hovered
- **Focused**: label=Save, style=elevated, interaction=focused
- **Pressed**: label=Save, style=tonal, interaction=pressed
- **Long label**: label=Save all, style=filled

## Fidelity

Reference: Compose `material3` 1.4.0, commit `5113b82a4ed6416d6344efa50e41db8cb65928ff` (decisions 1 to 3 of the faithful Material 3 stage). 1 dp = 1 component unit; the container density converts to image pixels (`docs/COMPONENT-FORMAT.md`, "Units and density"). The values come from the specialization tokens (`tokens`, in the `light` and `dark` modes), which mirror the androidx token files; no color, font or radius is literal in the component.

**Files used**

- `compose/material3/material3/src/commonMain/kotlin/androidx/compose/material3/Button.kt` (lines 143 to 148: the `Row` with `defaultMinSize(58, 40)` and the `padding(contentPadding)`, the `contentPadding` and the `labelLarge` style; 479 to 543: `ContentPadding` 24/8, `ButtonWithIconContentPadding` with start 16, `TextButtonContentPadding` 12, `TextButtonWithIconContentPadding` 12/16, `MinWidth` 58, `MinHeight` 40, `IconSize` 18 and `IconSpacing` 8; 550 onward: the `corner-full` shape; 598 to 790: the default colors of each style; 805 to 880: the elevations; 898 to 910: `outlinedButtonBorder`).
- `compose/material3/material3/src/commonMain/kotlin/androidx/compose/material3/tokens/ButtonSmallTokens.kt` (`ContainerHeight` 40, `ContainerShapeRound` = `CornerFull`, `IconLabelSpace` 8, `OutlinedOutlineWidth` 1), `tokens/BaselineButtonTokens.kt` (`LeadingSpace` and `TrailingSpace` 24).
- `compose/material3/material3/src/commonMain/kotlin/androidx/compose/material3/tokens/FilledButtonTokens.kt`, `ElevatedButtonTokens.kt`, `FilledTonalButtonTokens.kt`, `OutlinedButtonTokens.kt` and `TextButtonTokens.kt`: color roles, disabled opacities (0.1; 0.12 on the tonal; 0.38 on the content) and `ContainerElevation` (level 1 only on the elevated).

**How the drawing follows Compose**

- Minimum width 58, minimum height 40 and `corner-full` shape; the container is a rectangle behind the content, which stays centered.
- **Height from the label lines:** `sizing.height` is `hug` and the root carries the minimum of 40 (`minHeight`). The `content` frame and the `label` node hug the height, like the `Row(Modifier.defaultMinSize(58, 40).padding(contentPadding))` in `Button.kt` (lines 143 to 148; the vertical padding `ButtonVerticalPadding` is 8, line 469, and the `ContentPadding`, lines 479 to 485): one line gives 8 + 20 + 8 = 36, which the minimum takes to 40, and two lines give 8 + 40 + 8 = 56. Arrange and `fit_marking` keep the marking width and take the height to that value.
- **The label wraps in the remaining width:** the `maxWidth` of the `label` node is the instance width (`$size.width`) minus the side paddings and, with an icon, the 18 icon and the 8 of space (48; 24 on `text`; 66 with an icon, 54 on `text` with an icon). A label that exceeds that wraps by word, like Compose's `Text` inside the `Row`.
- Content padding: 24 on the sides and 8 on top and bottom (16 at the start with an icon); on `text`, 12 (12 at the start and 16 at the end with an icon).
- 18 icon drawn by the `icon` node (Compose name to set name, as in `icon`), 8 of space to the label. The label uses the `label-large-*` tokens (14, weight 500, line 20, spacing 0.1) and the theme font (`font-sans`), with no `family` in the file.
- The label is centered by the capital letter height (`font.verticalAlign: "cap-middle"`): the node hugs the line height (20) and the `content` frame stays centered in the button height, so the center of the letter falls at the center of the 40 box, whatever the font; with several lines, the whole block stays centered. Compose's `Text` centers by the font's line box; with Roboto the two coincide to within 1 px.
- Colors (the same in both modes, with each mode's values): filled `primary` / `on-primary`; tonal `secondary-container` / `on-secondary-container`; elevated `surface-container-low` / `primary`, with the two level 1 shadows (point: `y` 1, `blur` 2; ambient: `y` 1, `blur` 3, `spread` 1; tokens `elevation-1-point-*` and `elevation-1-ambient-*`); outlined with no background, content `on-surface-variant` and a 1 outline in `outline-variant`; text with no background and content `primary` (the commit's `defaultTextButtonColors` uses `Primary`, not the `OnSurfaceVariant` token).
- Disabled: the container becomes `on-surface` at 0.1 (`state-disabled-container-filled`; 0.12 on the tonal, `state-disabled-container`) and the content at 0.38 (`state-disabled-content`), in `on-surface-variant` (in `on-surface` on the tonal); the outlined has the outline at 0.1; the elevated loses the shadow.

**Interaction state (`interaction` field)**

The field chooses the still appearance of a state, as `enabled` chooses the disabled one; it does not enter the `code` or the `variants`. The options are `none` and the states that the commit's `*ButtonTokens.kt` define for the button: `hovered`, `focused` and `pressed` (there is no `Dragged*` in the button tokens, so there is no `dragged`).

- **State layer:** the `state` node is a `rect` with the button's shape (`corner-full`), between the outline and the content, with the content color of the style (`on-primary` on filled, `on-secondary-container` on tonal, `primary` on elevated and text, `on-surface-variant` on outlined; the `*ButtonTokens.kt` repeat the content color in `Hovered*`, `Focused*` and `Pressed*`) and `opacity` from the tokens `state-hover` (0.08), `state-focus` (0.10) and `state-pressed` (0.10), which mirror `compose/material3/material3/src/commonMain/kotlin/androidx/compose/material3/tokens/StateTokens.kt` (lines 22 to 25: `HoverStateLayerOpacity`, `FocusStateLayerOpacity`, `PressedStateLayerOpacity`; `DraggedStateLayerOpacity` 0.16 is the `state-dragged`).
- **Elevation per state** (`$if` on `interaction` in the container shadow, `FilledButtonTokens.kt`, `FilledTonalButtonTokens.kt` and `ElevatedButtonTokens.kt`, `*ContainerElevation` lines): filled and tonal rise to level 1 on hover (`HoveredContainerElevation`) and stay at 0 on focus and pressed; the elevated goes from 1 to 2 on hover and stays at 1 on focus and pressed; outlined and text have no shadow.
- **Disabled wins:** with `enabled` `false` the `state` node is invisible and the elevation goes away, so the drawing is the disabled one, whatever the `interaction`.
- **Outline color** (outlined): `OutlineVariant` in the three states, the same as the default.

**What still differs from Compose**

- No Material expressive `pressed` shape, no animated ripple and no transition between states (the drawing is a still frame). Compose defines no focus ring for this type in the pinned commit (none of its `*Tokens.kt` carries `FocusIndicatorColor`): none is drawn.
- The shadow reads the elevation tokens (`$token` in `shadow.y` and `shadow.blur`: `elevation-1-*` on the root and, at level 2 of the elevated on hover, `elevation-2-*`). `y` and `blur` do not accept an expression, so the level 2 shadow is a separate node (`elevated shadow`), visible only on the hovered elevated.
- Measuring by the content (stage #898) covers the height and the label wrapping; the starting width of the label is that of the marking: with no rectangle (new instance, screen arranged by `layoutScreen`) the `size` of 136 applies, so a label wider than that wraps instead of widening the button, where Compose, with no limit from the parent, does not wrap. The "Long label" example ("Save all") is the longest label that fits on one line in the `size` (136 × 40): a label that wraps (like "Save changes and keep editing") goes past the 40 box until Arrange takes it to 16 + 20 × lines, because the marking only changes by action, and the library's drawing check warns `content larger than the box` on that marking.

**Accessibility** (stage #1081; the unit is the dp, 1 dp = 1 component unit): the type has `accessibility.role` `button` and reads the accessible name from the `label` field. It declares `touchTarget` `expanded` (48 × 48, inherited from the root): Compose enlarges the touch area to the minimum with `minimumInteractiveComponentSize`, `compose/material3/material3/src/commonMain/kotlin/androidx/compose/material3/Surface.kt` (line 219: `clickable` `Surface`); the role is `compose/material3/material3/src/commonMain/kotlin/androidx/compose/material3/Button.kt` (lines 126 to 130: `Surface(onClick…)` with `Role.Button` at 130). The overlap of the expanded touch areas between neighbors is not audited (#1998).
