# Switch

On and off switch. Use it for settings with an immediate effect.

Annotation type: `switch` (layer Components).

## Fields

| Key                    | Label                  | Type   | Required | Options                                 | Default | Description                                                                                                                                                                                                                                                 |
| ---------------------- | ---------------------- | ------ | -------- | --------------------------------------- | ------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `label`                | Label                  | string | no       |                                         |         | Text beside the switch (the Switch itself has no label).                                                                                                                                                                                                    |
| `checked`              | On                     | enum   | no       | `true`, `false`                         | `false` | true turns the switch on.                                                                                                                                                                                                                                   |
| `enabled`              | Enabled                | enum   | no       | `true`, `false`                         | `true`  | false disables the switch.                                                                                                                                                                                                                                  |
| `thumbIcon`            | Thumb icon             | enum   | no       | `true`, `false`                         | `false` | true shows a check icon on the thumb when on.                                                                                                                                                                                                               |
| `thumbIconDescription` | Thumb icon description | string | no       | free text                               |         | Accessible description of the thumb icon, read by a screen reader. Empty = the icon is decorative and is not announced.                                                                                                                                     |
| `interaction`          | Interaction            | enum   | no       | `none`, `hovered`, `focused`, `pressed` | `none`  | Resting appearance of the interaction state: hovered, focused or pressed (pressed, the handle goes to 28); none = no state layer. It only changes the drawing and does not go into the code. With enabled false nothing is drawn (the disabled state wins). |

## Compose

- Symbol: `androidx.compose.material3.Switch`
- File (`path`): `compose/material3/material3/src/commonMain/kotlin/androidx/compose/material3/Switch.kt`

How the annotation becomes the call (the values below are examples; the parameter names and expressions are those of `params` and `values` in `code`):

```kotlin
Row(verticalAlignment = Alignment.CenterVertically) {
    Text("Airplane mode", Modifier.weight(1f))
    Switch(
        checked = checked,
        onCheckedChange = { checked = it },
        enabled = true,
        thumbContent = {    // only with thumbIcon = true
            Icon(Icons.Filled.Check, contentDescription = null, Modifier.size(SwitchDefaults.IconSize))
        },
    )
}
```

`code` notes (what the tool hands to the agent):

> `onCheckedChange` binds to the screen logic. The Switch has no label: the `label` becomes a `Text` beside it, in a `Row`. With `thumbIcon = true`, pass `thumbContent = { Icon(Icons.Filled.Check, contentDescription = null, Modifier.size(SwitchDefaults.IconSize)) }`.

## Examples

- **Off**: label=Notifications, checked=false
- **On with icon**: label=Airplane mode, checked=true, thumbIcon=true
- **Hovered**: label=Wi-Fi, checked=false, interaction=hovered
- **Focused**: label=Wi-Fi, checked=true, thumbIcon=true, interaction=focused
- **Pressed**: label=Wi-Fi, checked=true, interaction=pressed

## Fidelity

Reference: Compose `material3` 1.4.0, commit `5113b82a4ed6416d6344efa50e41db8cb65928ff` (decisions 1 to 3 of the faithful Material 3 stage). 1 dp = 1 component unit; the container density converts it to image pixels (`docs/COMPONENT-FORMAT.md`, "Units and density"). The values come from the specialization tokens (`tokens`, in the `light` and `dark` modes), which mirror the androidx token files; no color, font or opacity is literal in the component.

**Files used**

- `compose/material3/material3/src/commonMain/kotlin/androidx/compose/material3/Switch.kt` (lines 91 to 133: `Switch` with `requiredSize(SwitchWidth, SwitchHeight)`; 136 to 182: `SwitchImpl`, the track `border` and `background` and the handle background; 209 to 297: `ThumbNode`, the size 24 or 16 (`hasContent || checked`) and the `minBound` and `maxBound` position; 389 to 433: `defaultSwitchColors` (disabled is `compositeOver(surface)`); 436: `IconSize` 16; 529 to 580: `thumbColor`, `trackColor`, `borderColor` and `iconColor` by state; 624 to 629: `ThumbDiameter`, `UncheckedThumbDiameter`, `SwitchWidth`, `SwitchHeight` and `ThumbPadding`).
- `compose/material3/material3/src/commonMain/kotlin/androidx/compose/material3/tokens/SwitchTokens.kt` (lines 23 to 82: `TrackWidth` 52, `TrackHeight` 32, `TrackOutlineWidth` 2, `SelectedHandleWidth` 24, `UnselectedHandleWidth` 16, the track, handle, outline and icon color roles, `DisabledTrackOpacity` 0.12 and the 0.38 opacities; lines 38 and 39: `PressedHandleHeight` and `PressedHandleWidth` 28; 40 to 53 and 61 to 77: the `Focus`, `Hover` and `Pressed` roles; 56: `StateLayerSize` 40).
- `compose/material3/material3/src/commonMain/kotlin/androidx/compose/material3/tokens/StateTokens.kt` (lines 22 to 25: `HoverStateLayerOpacity`, `FocusStateLayerOpacity`, `PressedStateLayerOpacity`; `DraggedStateLayerOpacity` 0.16 is the `state-dragged`).

**How the drawing follows Compose**

- Track 52 by 32 in the `corner-full` shape. On: `primary`, no outline. Off: `surface-container-highest` with a 2 outline inside in `outline` (the `border` is drawn over the background).
- Circular handle: on 24 in `on-primary`, 4 from the right edge (`thumbPathLength` = 52 - 24 - 4); off 16 in `outline`, 8 from the left ((32 - 16) / 2); off with icon 24, at 4 (the handle becomes 24 when there is `thumbContent`). The handle sits in the center of a 24 area that the track places with a `padding` of 4 and `justify` at the end or start.
- Handle icon (`thumbIcon`) of 16 (`SwitchDefaults.IconSize`), an `icon` node of the set: `check` when on in `on-primary-container` and `close` when off in `surface-container-highest`.
- Disabled: Compose composites each color over the `surface` (`compositeOver(surface)`). The drawing does the same, in a single opaque layer (`over: "surface"` in the `$token`, without stacking transparency; `Switch.kt`, lines 343 to 368 and 405 to 409): on track `on-surface` at 0.12 (`state-disabled-container`), off `surface-container-highest` at 0.12, outline `on-surface` at 0.12, on handle `surface`, off handle `on-surface` at 0.38 and icons at 0.38 (`on-surface` when on, `surface-container-highest` when off). Light and dark follow the same tokens.

**Interaction state (`interaction` field)**

The field chooses the resting appearance of a state, as `enabled` chooses the disabled state; it does not go into the `code` or the `variants`. The options are `none` and the states that the commit's `SwitchTokens.kt` defines: `hovered`, `focused` and `pressed` (there is no `Dragged*`, so there is no `dragged`).

- **State layer:** the `state` node is a 32 circle centered on the handle, behind it, a child of the `switch` frame. Compose uses 40 (`StateLayerSize`, `StateLayerShape` `CornerFull`, lines 55 and 56), but the component box has the track height (32): a 40 circle would go past it, and the drawing lets nothing leak out of the box, so the layer is contained (4 less on each side). `SwitchTokens.kt` does not carry the layer color; it follows Material 3 for selection, as in the checkbox: `primary` when on and `on-surface` when off. The `opacity` comes from the `state-hover` (0.08), `state-focus` (0.10) and `state-pressed` (0.10) tokens.
- **Handle by state:** when on, the color goes from `on-primary` to `primary-container` in all three states (`SelectedHoverHandleColor`, `SelectedFocusHandleColor`, `SelectedPressedHandleColor`, lines 46, 40 and 51); when off, from `outline` to `on-surface-variant` (`UnselectedHoverHandleColor`, `UnselectedFocusHandleColor`, `UnselectedPressedHandleColor`, lines 68, 61 and 74). Track, outline and icon keep the default colors (`Selected*TrackColor` `Primary`, `Unselected*TrackColor` `SurfaceContainerHighest`, `Unselected*TrackOutlineColor` `Outline`, `Selected*IconColor` `OnPrimaryContainer`).
- **Pressed handle:** becomes 28 by 28 (`PressedHandleWidth` and `PressedHandleHeight`, lines 38 and 39), on, off or with icon, centered in the same 24 area; mouse and focus do not change the size.
- **Disabled wins:** with `enabled` `false` the `state` node is invisible, the handle neither changes color nor goes to 28, so the drawing is the disabled one, whatever the `interaction`.

**Slots (named, `formatVersion` 17)**

- `thumbContent` (`(@Composable () -> Unit)?`, `Switch.kt` lines 91 to 133 and `ThumbNode`, lines 209 to 297) is a 24 by 24 slot, centered on the handle area, that takes one `icon`. The compose commit is `5113b82a4ed6416d6344efa50e41db8cb65928ff`.
- A child in the slot replaces the `thumbIcon` field's `check` or `close` (the default content); the `get_code_hints` writes `thumbContent = { Icon(...) }`. Without children the drawing is the one of before. The slot's box is always the 24 by 24 of the handle area, also when the handle is 16 (off, without icon).

**What still differs from Compose**

- No animated ripple, no transition between states and no handle slide animation: the drawing is a still frame. In `focused` the switch gets the focus ring (`FocusIndicatorColor`, `SwitchTokens.kt` line 36): the 3 ring in `secondary`, offset 2 from the shape (`stroke.offset`), outside the box (the width and the offset are from the stage decision; `*Tokens.kt` only provides the color), around the 52 × 32 track.
- The drawing's 32 layer is smaller than Compose's 40, which would go 4 above and below the 32 track and, with the switch against the right edge, 4 beyond the instance. When pressed the handle area grows from 24 to 28 (and the side inset drops from 4 to 2), so the 28 handle fits in it without changing the center. When pressed Compose also moves the handle inside the track (the inset); the drawing keeps the resting position.
- The default content of the `thumbContent` slot is the `thumbIcon` field's `check` when on and `close` when off (the Material pair), and the type's `code` only passes the `check`; the slot takes any `icon` marking.
- The 16 space between the label and the switch and the label at 0.38 when disabled are drawing conventions: Compose has no label.

**Accessibility** (stage #1081; the unit is the dp, 1 dp = 1 component unit): the type has `accessibility.role` `switch` and reads the accessible name from the `label` field. It declares `touchTarget` `expanded` (48 × 48, inherited from the root): Compose enlarges the touch area to the minimum with `minimumInteractiveComponentSize`, `compose/material3/material3/src/commonMain/kotlin/androidx/compose/material3/Switch.kt` (line 106); the role is `compose/material3/material3/src/commonMain/kotlin/androidx/compose/material3/Switch.kt` (line 111: `Role.Switch`). The overlap of the expanded touch areas between neighbors is not audited (#1998). The `thumbIcon` is a part with the optional `thumbIconDescription` field, because the icon inside the thumb is decorative by default.
