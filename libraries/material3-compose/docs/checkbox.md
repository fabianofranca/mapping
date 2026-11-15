# Checkbox

Selection box. Checked, unchecked or indeterminate (part of a group checked).

Annotation type: `checkbox` (Components layer).

## Fields

| Key           | Label       | Type   | Required | Options                                 | Default     | Description                                                                                                                                                                                            |
| ------------- | ----------- | ------ | -------- | --------------------------------------- | ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `label`       | Label       | string | no       |                                         |             | Text next to the box (the Checkbox itself has no label).                                                                                                                                               |
| `state`       | State       | enum   | no       | `unchecked`, `checked`, `indeterminate` | `unchecked` | unchecked, checked or indeterminate (TriStateCheckbox).                                                                                                                                                |
| `enabled`     | Enabled     | enum   | no       | `true`, `false`                         | `true`      | false disables the box.                                                                                                                                                                                |
| `interaction` | Interaction | enum   | no       | `none`, `hovered`, `focused`, `pressed` | `none`      | Still appearance of the interaction state: hovered, focused or pressed; none = no state layer. Only changes the drawing, does not enter the code. With enabled false it draws nothing (disabled wins). |

## Compose

- Symbol: `androidx.compose.material3.Checkbox`
- File (`path`): `compose/material3/material3/src/commonMain/kotlin/androidx/compose/material3/Checkbox.kt`
- The `state` field chooses the symbol; values without their own case use the base one.

| `state`                       | Symbol             |
| ----------------------------- | ------------------ |
| `unchecked`, `checked` (base) | `Checkbox`         |
| `indeterminate`               | `TriStateCheckbox` |

How the annotation becomes the call (the values below are examples; the parameter names and expressions are those of `params` and `values` in the `code`):

```kotlin
Row(verticalAlignment = Alignment.CenterVertically) {
    Checkbox(checked = true, onCheckedChange = { /* screen logic */ }, enabled = true)
    Text("Remember me")
}

// state indeterminate
Row(verticalAlignment = Alignment.CenterVertically) {
    TriStateCheckbox(state = ToggleableState.Indeterminate, onClick = { /* ... */ }, enabled = true)
    Text("Select all")
}
```

Notes from the `code` (what the tool hands to the agent):

> `onCheckedChange` connects to the screen logic. The Checkbox has no label: the `label` becomes a `Text` next to it, in a `Row`. The `indeterminate` state switches to `TriStateCheckbox`.

`indeterminate` variant: `TriStateCheckbox(state = ToggleableState.Indeterminate, onClick = …)` takes `onClick` in place of `onCheckedChange`; import `androidx.compose.ui.state.ToggleableState`. The `label` becomes a `Text` next to it, in a `Row`.

## Examples

- **Unchecked**: label=Accept the terms, state=unchecked
- **Checked**: label=Remember me, state=checked
- **Indeterminate**: label=Select all, state=indeterminate
- **Hovered**: label=Accept the terms, state=unchecked, interaction=hovered
- **Focused**: label=Remember me, state=checked, interaction=focused
- **Pressed**: label=Select all, state=indeterminate, interaction=pressed

## Fidelity

Reference: Compose `material3` 1.4.0, commit `5113b82a4ed6416d6344efa50e41db8cb65928ff` (decisions 1 to 3 of the faithful Material 3 stage). 1 dp = 1 component unit; the container density converts to image pixels (`docs/COMPONENT-FORMAT.md`, "Units and density"). The values come from the specialization tokens (`tokens`, in the `light` and `dark` modes), which mirror the androidx token files; no color, font or opacity is literal in the component.

**Files used**

- `compose/material3/material3/src/commonMain/kotlin/androidx/compose/material3/Checkbox.kt` (lines 91 to 110: `Checkbox` with a stroke of 2 and a square cap; 267 to 306: `TriStateCheckbox`, the touch `minimumInteractiveComponentSize` and the `padding(CheckboxDefaultPadding)`; 357 to 386: `defaultCheckboxColors`; 395 to 459: `CheckboxImpl` and the `Canvas` of `requiredSize(CheckboxSize)`; 461 to 487: `drawBox`; 489 to 523: `drawCheck`; 607 to 681: `checkmarkColor`, `boxColor` and `borderColor` per state; 736 to 738: `CheckboxDefaultPadding` 2, `CheckboxSize` 20 and `RadiusSize` 2).
- `compose/material3/material3/src/commonMain/kotlin/androidx/compose/material3/tokens/CheckboxTokens.kt` (lines 24 to 76: color roles `SelectedContainerColor` `Primary`, `SelectedIconColor` `OnPrimary`, `UnselectedOutlineColor` `OnSurfaceVariant`, the disabled ones `OnSurface` at 0.38 and `UnselectedOutlineWidth` 2; lines 45 to 55 and 68 to 75: the `Focus*`, `Hover*` and `Pressed*` roles; 56 and 57: `StateLayerShape` and `StateLayerSize`).
- `compose/material3/material3/src/commonMain/kotlin/androidx/compose/material3/tokens/StateTokens.kt` (lines 22 to 25: `HoverStateLayerOpacity`, `FocusStateLayerOpacity`, `PressedStateLayerOpacity`; `DraggedStateLayerOpacity` 0.16 is the `state-dragged`).

**How the drawing follows Compose**

- The box is **20** by 20 with radius 2 (`CheckboxSize` and `RadiusSize` of `Checkbox.kt`, which drive the `Canvas`; the token `ContainerHeight` of 18 is not what the code draws) and sits at the center of the 48 minimum touch target area (`minimumInteractiveComponentSize`), with the label right after, as in a `Row` with `onCheckedChange`. The label uses `body-large-*` and `on-surface`.
- Checked and indeterminate: the box is filled in `primary` (`drawBox` draws a single shape when the box and the border have the same color) and the mark is `on-primary`. The check is the three-point path of `drawCheck` (20% and 50%, 40% and 70%, 80% and 30% of the box) with a stroke of 2 and a square cap; the indeterminate dash is the same line with the cross at the center (50% and 50%), horizontal, from 4 to 16.
- Unchecked: no fill and a 2 outline on the inside in `on-surface-variant`.
- Disabled: the box (filled or the outline) goes to `on-surface` with `state-disabled-content` (0.38), in light and dark. The mark stays `on-primary` and undiluted, because `defaultCheckboxColors` uses `SelectedIconColor` also when disabled (the token `SelectedDisabledIconColor`, `Surface`, does not enter the code).

**Interaction state (`interaction` field)**

The field chooses the still appearance of a state, as `enabled` chooses the disabled one; it does not enter the `code` or the `variants`. The options are `none` and the states that the commit's `CheckboxTokens.kt` defines for the box: `hovered`, `focused` and `pressed` (there is no `Dragged*` in the checkbox tokens, so there is no `dragged`).

- **State layer:** the `state` node is a 40 circle (`StateLayerSize` 40, `StateLayerShape` `CornerFull`, lines 56 and 57) centered on the 20 box, behind it, in the 48 minimum touch target area. The color is that of the box's role: `primary` when checked or indeterminate (`SelectedHoverContainerColor`, `SelectedFocusContainerColor`, `SelectedPressedContainerColor`, lines 45, 48 and 53) and `on-surface` when unchecked (`UnselectedHoverOutlineColor`, `UnselectedFocusOutlineColor`, `UnselectedPressedOutlineColor`, lines 68, 70 and 74). The `opacity` comes from the tokens `state-hover` (0.08), `state-focus` (0.10) and `state-pressed` (0.10).
- **Unchecked outline:** goes from `on-surface-variant` to `on-surface` on hover, focus and pressed (lines 68, 70 and 74); the width stays 2 (`UnselectedHoverOutlineWidth`, `UnselectedFocusOutlineWidth` and `UnselectedPressedOutlineWidth` are 2, like `UnselectedOutlineWidth`).
- **Checked and indeterminate:** the box stays `primary` and the mark `on-primary` (`Selected*ContainerColor` and `Selected*IconColor` repeat the default roles); only the layer shows.
- **Disabled wins:** with `enabled` `false` the `state` node is invisible and the outline does not change, so the drawing is the disabled one, whatever the `interaction`.

**What still differs from Compose**

- No animated ripple, no transition between states and no animation of the check stroke (`checkDrawFraction`): the drawing is a still frame of the final state. Compose defines no focus ring for this type in the pinned commit (none of its `*Tokens.kt` carries `FocusIndicatorColor`): none is drawn.
- No error state: `CheckboxTokens.kt` has the `Error` colors of the roles `SelectedError*` and `UnselectedError*` (lines 34 to 44 and 61 to 67), but the type has no error field; the layer and the outline use only the normal roles.
- The radius 2 comes from the token `corner-checkbox` (`compose/material3/material3/src/commonMain/kotlin/androidx/compose/material3/tokens/CheckboxTokens.kt`, line 26: `ContainerShape = RoundedCornerShape(2.0.dp)`); `corner-extra-small` is 4.
- The area is 48 by 40: the height of 40 comes from the type's `sizing`, below the 48 minimum touch target. With `onClick = null` Compose draws only 24.
- The label at 0.38 when disabled is a drawing convention: Compose's `Text` inherits the content color and does not fade on its own.
- `checkedColor`, `uncheckedColor`, `checkmarkColor`, `disabledCheckedColor`, `disabledUncheckedColor` and `disabledIndeterminateColor` are fields and code, but the drawing does not use them; the swappable `Stroke`s and the error state have no field in the type.

**Accessibility** (stage #1081; the unit is the dp, 1 dp = 1 component unit): the type has `accessibility.role` `checkbox` and reads the accessible name from the `label` field. It declares `touchTarget` `expanded` (48 × 48, inherited from the root): Compose enlarges the touch area to the minimum with `minimumInteractiveComponentSize`, `compose/material3/material3/src/commonMain/kotlin/androidx/compose/material3/Checkbox.kt` (line 297); the role is `compose/material3/material3/src/commonMain/kotlin/androidx/compose/material3/Checkbox.kt` (line 283: `Role.Checkbox`). The overlap of the expanded touch areas between neighbors is not audited (#1998).
