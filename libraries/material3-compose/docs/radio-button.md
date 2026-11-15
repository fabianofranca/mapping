# Radio button

Exclusive option of a group: selecting one deselects the others. Use one per option.

Annotation type: `radio-button` (Components layer).

## Fields

| Key           | Label       | Type   | Required | Options                                 | Default | Description                                                                                                                                                                                                          |
| ------------- | ----------- | ------ | -------- | --------------------------------------- | ------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `label`       | Label       | string | no       |                                         |         | Text beside the button (the RadioButton itself has no label).                                                                                                                                                        |
| `selected`    | Selected    | enum   | no       | `true`, `false`                         | `false` | true selects the option.                                                                                                                                                                                             |
| `enabled`     | Enabled     | enum   | no       | `true`, `false`                         | `true`  | false disables the option.                                                                                                                                                                                           |
| `interaction` | Interaction | enum   | no       | `none`, `hovered`, `focused`, `pressed` | `none`  | Resting look of the interaction state: hovered, focused or pressed; none = no state layer. It only changes the drawing, it does not go into the code. With enabled false nothing is drawn (the disabled state wins). |

## Compose

- Symbol: `androidx.compose.material3.RadioButton`
- File (`path`): `compose/material3/material3/src/commonMain/kotlin/androidx/compose/material3/RadioButton.kt`

How the annotation becomes the call (the values below are examples; the parameter names and the expressions are those of `params` and `values` in `code`):

```kotlin
Row(
    Modifier.selectable(selected = selected, onClick = { selected = true }, role = Role.RadioButton),
    verticalAlignment = Alignment.CenterVertically,
) {
    RadioButton(
        selected = selected,
        onClick = null,    // the whole Row receives the tap
        enabled = true,
    )
    Text("Credit card")
}
```

Notes from `code` (what the tool hands to the agent):

> The RadioButton has no label: the `label` becomes a `Text` beside it, in a `Row`. The accessibility pattern is the whole `Row` selectable, `Modifier.selectable(selected = <selected>, onClick = { … }, role = Role.RadioButton)`, with `RadioButton(selected = <selected>, onClick = null)` inside; without the selectable `Row`, `onClick` binds to the screen logic. A group is a `Column` (or `Modifier.selectableGroup()`) with one RadioButton per option. It does not require an opt-in.

## Examples

- **Selected**: label=Credit card, selected=true
- **Not selected**: label=Bank slip, selected=false
- **Disabled**: label=Pix, selected=false, enabled=false
- **Hovered**: label=Bank slip, selected=false, interaction=hovered
- **Focused**: label=Credit card, selected=true, interaction=focused
- **Pressed**: label=Bank slip, selected=false, interaction=pressed

## Fidelity

Reference: Compose `material3` 1.4.0, commit `5113b82a4ed6416d6344efa50e41db8cb65928ff` (decisions 1 to 3 of the faithful Material 3 stage). 1 dp = 1 component unit; the container's density converts it to image pixels (`docs/COMPONENT-FORMAT.md`, "Units and density"). The values come from the specialization's tokens (`tokens`, in the `light` and `dark` modes), which mirror the androidx tokens files; no color, font or opacity is left literal in the component.

**Files used**

- `compose/material3/material3/src/commonMain/kotlin/androidx/compose/material3/RadioButton.kt` (lines 74 to 128: `RadioButton`, the `Canvas` with `padding(RadioButtonPadding)` and `requiredSize(IconSize)`, the ring's `drawCircle` and the dot's; 163 to 180: `defaultRadioButtonColors`; 224 to 240: `radioColor` by state; 264 to 266: `RadioButtonPadding` 2, `RadioButtonDotSize` 12 and `RadioStrokeWidth` 2).
- `compose/material3/material3/src/commonMain/kotlin/androidx/compose/material3/tokens/RadioButtonTokens.kt` (lines 23 to 38: `IconSize` 20, `SelectedIconColor` `Primary`, `UnselectedIconColor` `OnSurfaceVariant`, the disabled ones `OnSurface` at 0.38; lines 29 to 32 and 34 to 37: the `Focus`, `Hover` and `Pressed` roles; 33: `StateLayerSize` 40).
- `compose/material3/material3/src/commonMain/kotlin/androidx/compose/material3/tokens/StateTokens.kt` (lines 22 to 25: `HoverStateLayerOpacity`, `FocusStateLayerOpacity`, `PressedStateLayerOpacity`; `DraggedStateLayerOpacity` 0.16 is the `state-dragged`).

**How the drawing follows Compose**

- Ring of 20 by 20 with a 2 stroke on the inside (`drawCircle` with radius `IconSize / 2 - stroke / 2` and a `Stroke` of 2). The selected dot is filled and has a diameter of **10**: Compose draws it with radius `RadioButtonDotSize / 2 - stroke / 2` = 5, and not the 12 of the constant's name. The ring and the dot use the same color.
- The area is 24 (padding of 2 around the 20), the drawing of `RadioButton(onClick = null)` in a selectable `Row`, which is this type's call; the label (`body-large-*`, `on-surface`) comes right after.
- Colors: selected `primary`; unselected `on-surface-variant`; disabled `on-surface` with `state-disabled-content` (0.38), selected or not, in light and dark.

**Interaction state (the `interaction` field)**

The field chooses the resting look of a state, as `enabled` chooses the disabled state; it does not go into the `code` or the `variants`. The options are `none` and the states that the commit's `RadioButtonTokens.kt` defines: `hovered`, `focused` and `pressed` (there is no `Dragged*`, so there is no `dragged`).

- **State layer:** the `state` node is a 24 circle centered on the ring, behind it. Compose uses 40 (`StateLayerSize`, line 33), but the ring's area is 24 wide: the 40 circle would go past it and past the component's box, and the drawing lets nothing leak out of the box, so the layer is contained (8 less on each side), with the color of the state's role: `primary` when selected (`SelectedHoverIconColor`, `SelectedFocusIconColor`, `SelectedPressedIconColor`, lines 29, 30 and 32) and `on-surface` when unselected (`UnselectedHoverIconColor`, `UnselectedFocusIconColor`, `UnselectedPressedIconColor`, lines 34, 35 and 37). The `opacity` comes from the tokens `state-hover` (0.08), `state-focus` (0.10) and `state-pressed` (0.10).
- **Unselected ring:** goes from `on-surface-variant` to `on-surface` with hover, focus and pressed (the same lines); the selected one stays `primary` on the ring and the dot.
- **Disabled wins:** with `enabled` `false` the `state` node is invisible and the ring does not change, so the drawing is the disabled one, whatever the `interaction`.

**What still differs from Compose**

- No animated ripple, no transition between states and no dot animation (`animateDpAsState`): the drawing is a resting frame of the final state. Compose defines no focus ring for this type at the pinned commit (none of its `*Tokens.kt` brings `FocusIndicatorColor`): none is drawn.
- The drawing's 24 layer is smaller than Compose's 40, which would go 8 past each side of the 24 area and, on the left edge, 8 past the instance's box. In Compose the layer comes from the `Row`'s `selectable` and from `minimumInteractiveComponentSize`.
- With `onClick` filled Compose enlarges the area to 48 (`minimumInteractiveComponentSize`); the drawing keeps the 24 of the call with `onClick = null`.
- The label at 0.38 when disabled is a convention of the drawing: Compose's `Text` inherits the content color and does not dim by itself.

**Accessibility** (stage #1081; the unit is the dp, 1 dp = 1 component unit): the type has `accessibility.role` `radio` and reads the accessible name from the `label` field. It declares `touchTarget` `expanded` (48 × 48, inherited from the root): Compose enlarges the touch area to the minimum with `minimumInteractiveComponentSize`, `compose/material3/material3/src/commonMain/kotlin/androidx/compose/material3/RadioButton.kt` (line 106); the role is `compose/material3/material3/src/commonMain/kotlin/androidx/compose/material3/RadioButton.kt` (line 95: `Role.RadioButton`). The overlap of the expanded touch areas between neighbors is not audited (#1998).
