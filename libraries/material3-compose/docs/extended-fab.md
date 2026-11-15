# Extended FAB

A floating action button with an icon and text. Use it when the action needs a label.

Annotation type: `extended-fab` (Components layer).

## Fields

| Key              | Label        | Type   | Required | Options                                                   | Default            | Description                                                                                                                                                                                                                            |
| ---------------- | ------------ | ------ | -------- | --------------------------------------------------------- | ------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `text`           | Text         | string | yes      |                                                           |                    | Label of the button.                                                                                                                                                                                                                   |
| `icon`           | Icon         | string | no       | free text; icon suggestions (`Home`, `Search`, `Person`…) |                    | Icon before the text. Empty = text only.                                                                                                                                                                                               |
| `expanded`       | Expanded     | enum   | no       | `true`, `false`                                           | `true`             | false collapses the button to just the icon.                                                                                                                                                                                           |
| `containerColor` | Button color | enum   | no       | `ColorScheme` roles                                       | `primaryContainer` | Theme color role used for the button background.                                                                                                                                                                                       |
| `interaction`    | Interaction  | enum   | no       | `none`, `hovered`, `focused`, `pressed`                   | `none`             | Resting appearance of the interaction state: hovered, focused or pressed; none = no state layer. It only changes the drawing, it does not go in the code. The extended FAB has no disabled state (no enabled): the state always draws. |

## Compose

- Symbol: `androidx.compose.material3.ExtendedFloatingActionButton`
- File (`path`): `compose/material3/material3/src/commonMain/kotlin/androidx/compose/material3/FloatingActionButton.kt`

How the annotation becomes the call (the values below are examples; the parameter names and expressions are those of `params` and `values` in `code`):

```kotlin
ExtendedFloatingActionButton(
    text = { Text("Create") },
    icon = { Icon(Icons.Filled.Add, contentDescription = null) },
    onClick = { /* screen logic */ },
    expanded = true,
    containerColor = MaterialTheme.colorScheme.primaryContainer,
)
```

Notes from `code` (what the tool hands to the agent):

> Use the overload `ExtendedFloatingActionButton(text = { Text(<text>) }, icon = { Icon(Icons.Filled.<icon>, contentDescription = null) }, onClick = …, expanded = <expanded>)`; without `icon`, use the one with `content = { Text(<text>) }`. Inside a Scaffold, it goes in `floatingActionButton`. Since material3 1.4.0 the icons require `androidx.compose.material:material-icons-core` (or `-extended`) or a Material Symbol downloaded with `painterResource`; the ones that mirror (ArrowBack, KeyboardArrowRight, List) live in `Icons.AutoMirrored.Filled`.

## Examples

- **Create**: text=Create, icon=Add
- **Collapsed**: text=Edit, icon=Edit, expanded=false, containerColor=secondaryContainer
- **Hovered**: text=Create, icon=Add, interaction=hovered
- **Focused**: text=Edit, icon=Edit, containerColor=secondaryContainer, interaction=focused
- **Pressed**: text=Edit, icon=Edit, expanded=false, containerColor=tertiaryContainer, interaction=pressed
- **Long label**: text=New tax invoice, icon=Add

## Fidelity

Reference: Compose `material3` 1.4.0, commit `5113b82a4ed6416d6344efa50e41db8cb65928ff` (decisions 1 to 3 of the faithful Material 3 stage). 1 dp = 1 component unit; the container density converts it to image pixels (`docs/COMPONENT-FORMAT.md`, "Units and density"). The values come from the specialization tokens (`tokens`, in the `light` and `dark` modes), which mirror the androidx token files; no color, font or radius is literal in the component.

**Files used**

- `compose/material3/material3/src/commonMain/kotlin/androidx/compose/material3/FloatingActionButton.kt`: the `ExtendedFloatingActionButton` with text and icon (lines 381 to 433: `expanded`, `startPadding` 16 and `endPadding` 20 when expanded, `Arrangement.Start` expanded and `Center` collapsed, `Spacer` of `ExtendedFabEndIconPadding`), the common body (lines 134 to 169) and the constants on lines 786 to 792 (`ExtendedFabStartIconPadding = 16.dp`, `ExtendedFabEndIconPadding = 12.dp`, `ExtendedFabTextPadding = 20.dp`, `ExtendedFabMinimumWidth = 80.dp`); the collapsed one has a minimum width of `FabBaselineTokens.ContainerWidth` (56). Lines 107 to 123: the `textStyle` is `ExtendedFabPrimaryTokens.LabelTextFont`.
- `compose/material3/material3/src/commonMain/kotlin/androidx/compose/material3/tokens/ExtendedFabPrimaryTokens.kt` (lines 23 to 45: `ContainerColor = PrimaryContainer`, `ContainerElevation = Level3`, `ContainerHeight = 56.dp`, `ContainerShape = CornerLarge`, `IconSize = 24.dp`, `IconColor` and `LabelTextColor = OnPrimaryContainer`, `LabelTextFont = LabelLarge`) and `ElevationTokens.kt`.
- `compose/material3/material3/src/commonMain/kotlin/androidx/compose/material3/ColorScheme.kt` (lines 1064 to 1092: `contentColorFor`) and `tokens/TypeScaleTokens.kt` (`LabelLarge`: 14 sp, 20 line height, weight 500, 0.1 letter spacing).

**How the drawing follows Compose**

- Minimum height of 56, `corner-large`, background by the `containerColor` role (default `primary-container`) and a level 3 shadow.
- **Height by the text lines:** `sizing.height` is `hug` and the root carries the minimum of 56 (`minHeight`; the `FloatingActionButton`'s `Box` has a `defaultMinSize` of `FabBaselineTokens.ContainerWidth` by `ContainerHeight`, 56 by 56, `FloatingActionButton.kt` lines 122, 123 and 161). The `content` frame and the `text` node hug the height and there is no vertical padding (the `Row` only has padding on the sides, lines 333 and 334 and 402 to 417), so one and two lines (20 and 40) stay within the minimum 56 and three lines measure 60. The text wraps in what is left of the marking width: the `maxWidth` of the `text` node is the instance width (`$size.width`) minus the paddings (36 with an icon, 40 without) and, with an icon, the 24 icon and the 12 gap (72 in total).
- Expanded with icon: padding 16 before the icon and 20 after the text, 12 between the 24 icon and the text, minimum width 80; text only: padding of 20 on both sides. Collapsed (`expanded` false, with an icon): no padding and minimum width 56, just the icon.
- The text reads `label-large-size`, `label-large-line-height`, `label-large-weight` and `label-large-tracking`, without `family`; the text and the icon use the content color from `contentColorFor` (`primary-container` -> `on-primary-container`…).
- The icon is the `icon` node, with the `$switch` from the Compose name to the set's name, covering the field's suggestions.
- Drawing structure: the root has the background, shape and shadow and holds the state nodes and the `content` frame (the row with the icon and the text, centered), so that the state layer covers the whole button without entering the row; the position of the icon and the text is the same as before.
- A one-line label centered by the capital letter (`cap-middle`): the `text` node uses `font.verticalAlign: "cap-middle"` and hugs the line height (20), with the `content` frame centered in the button height, without changing the horizontal position. Compose's `Text` centers by the font's line box (ascent and descent); the drawing centers the capital height in the box, and with Roboto the two coincide within 1 px.

**Interaction state (`interaction` field)**

The field chooses the resting appearance of a state, as `expanded` chooses the collapsed one; it does not go in the `code` or in the `variants`. The options are `none` and the states that the commit's `ExtendedFabPrimaryTokens.kt` defines: `hovered` (`Hover*`), `focused` (`Focus*`) and `pressed` (`Pressed*`); there is no `Dragged*` in the tokens, so there is no `dragged`. Compose's button has no `enabled`, so there is no disabled state: the state always draws.

- **State layer:** the `state` node is a `rect` in the button's shape (`corner-large`), between the background and the content, with the content color of the `containerColor` (the same as the icon and the text: `on-primary-container` by default; `Focus*`, `Hover*` and `Pressed*` of `IconColor` and `LabelTextColor` repeat `OnPrimaryContainer`, lines 29, 30, 32, 33, 43 and 44 of `compose/material3/material3/src/commonMain/kotlin/androidx/compose/material3/tokens/ExtendedFabPrimaryTokens.kt`) and `opacity` from the tokens `state-hover` (0.08), `state-focus` (0.10) and `state-pressed` (0.10), which mirror `compose/material3/material3/src/commonMain/kotlin/androidx/compose/material3/tokens/StateTokens.kt` (lines 22 to 25: `HoverStateLayerOpacity`, `FocusStateLayerOpacity`, `PressedStateLayerOpacity`; `DraggedStateLayerOpacity` 0.16 is the `state-dragged`).
- **Elevation per state** (`ExtendedFabPrimaryTokens.kt`, lines 25, 28, 31 and 42): hovered rises from level 3 to 4 (`HoverContainerElevation = Level4`, line 31); focused and pressed stay at level 3 (`FocusContainerElevation`, line 28; `PressedContainerElevation`, line 42). The shadow accepts `$token` in `y` and `blur`, but not an expression, so the level 4 one (the two shadows of `elevation-4-point-*` and `elevation-4-ambient-*`) belongs to a separate node (`elevated shadow`, with the same background and the same shape, visible only when hovered) and the container's shadow disappears in that state. Focused and pressed draw the same (same opacity, 0.10, and same level).
- **Lowered:** `ExtendedFabPrimaryTokens.kt` also has `LoweredContainerElevation` (level 1), `LoweredHoverContainerElevation` (level 2) and the focus and pressed variants (level 1), used by `ExtendedFloatingActionButtonDefaults.loweredElevation()`. The type has no lowered style (the base elevation is always level 3), so these elevations are not drawn.

**What still differs from Compose**

- The two shadows come from the tokens `elevation-3-point-*` and `elevation-3-ambient-*` (that of the `elevated shadow` node, from `elevation-4-*`), by `$token`. Material 3 elevation values for the web: `elevation/internal/_elevation.scss` of `material-components/material-web` (version 2.5.0, commit `37aa14b843dcaeb3a46f898679fa6fcd109b1905`), a source outside Compose, which on Android hands the elevation to the platform and does not carry the numbers: point shadow in black at 30% and ambient shadow in black at 15%, with `y`, `blur` and `spread` per level (tokens `elevation-<n>-point-*` and `elevation-<n>-ambient-*`).
- The expand and collapse animation (`AnimatedVisibility`) does not exist: the drawing shows the two fixed states. Tonal elevation is also left out, as in `fab`.
- The expanded content is centered in the marking box, like the button's `Box`. Without a rectangle (a new instance, screen arranged by `layoutScreen`), the width is that of the content (`sizing.width` `hug`) and the starting width of the text is the `size` of 142: a wider text wraps instead of widening the button, where Compose, with no limit from the parent, does not wrap. The "Long label" example ("New tax invoice") is the longest text that fits on one line at the `size` (142 × 56): a text that wraps (like "Create tax invoice") goes past the box until Arrange takes it to 60.
- No animated ripple and no transition between states (the drawing is a still frame). Compose defines no focus ring for this type at the pinned commit (none of its `*Tokens.kt` has `FocusIndicatorColor`): none is drawn. Compose's `lowered` elevation is not a field of the type (see above).

**Accessibility** (stage #1081; the unit is the dp, 1 dp = 1 component unit): the type has `accessibility.role` `button` and reads the accessible name from the `text` field. It declares `touchTarget` `expanded` (48 × 48, inherited from the root): Compose enlarges the touch area to the minimum with `minimumInteractiveComponentSize`, `compose/material3/material3/src/commonMain/kotlin/androidx/compose/material3/Surface.kt` (line 219: `clickable` `Surface`, which the floating action button is built on); the role is `compose/material3/material3/src/commonMain/kotlin/androidx/compose/material3/FloatingActionButton.kt` (lines 149 to 151: `Role.Button` at 151; `ExtendedFloatingActionButton` calls it around line 453). The overlap of the expanded touch areas between neighbors is not audited (#1998).
