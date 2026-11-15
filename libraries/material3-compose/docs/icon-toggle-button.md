# Icon toggle button

An icon button that toggles on and off (favorite, pin, mute). Standard, filled, tonal or outlined, checked or unchecked.

Annotation type: `icon-toggle-button` (Components layer).

## Fields

| Key                  | Label       | Type   | Required | Options                                                   | Default    | Description                                                                                                                                                                                                    |
| -------------------- | ----------- | ------ | -------- | --------------------------------------------------------- | ---------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `icon`               | Icon        | string | yes      | free text; icon suggestions (`Home`, `Search`, `Person`…) | `Favorite` | Icon of the button.                                                                                                                                                                                            |
| `contentDescription` | Description | string | no       |                                                           |            | Accessibility text of the button (goes in the Icon's `contentDescription`). Empty = no name for screen readers.                                                                                                |
| `style`              | Style       | enum   | no       | `standard`, `filled`, `tonal`, `outlined`                 | `standard` | standard (IconToggleButton), filled (FilledIconToggleButton), tonal (FilledTonalIconToggleButton) or outlined (OutlinedIconToggleButton).                                                                      |
| `checked`            | Checked     | enum   | no       | `true`, `false`                                           | `false`    | true turns the button on (the style's selection color).                                                                                                                                                        |
| `enabled`            | Enabled     | enum   | no       | `true`, `false`                                           | `true`     | false disables the button.                                                                                                                                                                                     |
| `interaction`        | Interaction | enum   | no       | `none`, `hovered`, `focused`, `pressed`                   | `none`     | Resting appearance of the interaction state: hovered, focused or pressed; none = no state layer. It only changes the drawing, it does not go in the code. With enabled false nothing is drawn (disabled wins). |

## Compose

- Symbol: `androidx.compose.material3.IconToggleButton`
- File (`path`): `compose/material3/material3/src/commonMain/kotlin/androidx/compose/material3/IconButton.kt`
- The `style` field chooses the symbol; values without their own case use the base one.

| `style`           | Symbol                        |
| ----------------- | ----------------------------- |
| `standard` (base) | `IconToggleButton`            |
| `filled`          | `FilledIconToggleButton`      |
| `tonal`           | `FilledTonalIconToggleButton` |
| `outlined`        | `OutlinedIconToggleButton`    |

How the annotation becomes the call (the values below are examples; the parameter names and expressions are those of `params` and `values` in `code`):

```kotlin
IconToggleButton( // style filled: FilledIconToggleButton, tonal: FilledTonalIconToggleButton, outlined: OutlinedIconToggleButton
    checked = checked,
    onCheckedChange = { checked = it },
    enabled = true,
) {
    Icon(Icons.Filled.Favorite, contentDescription = "Favorite")
}
```

Notes from `code` (what the tool hands to the agent):

> `onCheckedChange` connects to the screen logic and the icon goes in `content = { Icon(Icons.Filled.<icon>, contentDescription = <contentDescription>) }`. It is customary to swap the icon when checked (for example `Icons.Filled.Favorite` checked and `Icons.Outlined.FavoriteBorder` unchecked): the drawing uses the same `icon` in both states. No style requires an opt-in. 1.4.0 does not ship the icons: the app adds `androidx.compose.material:material-icons-core` (or `-extended`) or uses a Material Symbol with `painterResource`.

## Examples

- **Off**: icon=Favorite, contentDescription=Favorite, style=standard, checked=false
- **Filled on**: icon=Favorite, contentDescription=Favorite, style=filled, checked=true
- **Outlined on**: icon=Notifications, contentDescription=Notifications, style=outlined, checked=true
- **Hovered**: icon=Favorite, contentDescription=Favorite, style=filled, checked=true, interaction=hovered
- **Focused**: icon=Notifications, contentDescription=Notifications, style=outlined, checked=false, interaction=focused
- **Pressed**: icon=Favorite, contentDescription=Favorite, style=tonal, checked=true, interaction=pressed

## Fidelity

Reference: Compose `material3` 1.4.0, commit `5113b82a4ed6416d6344efa50e41db8cb65928ff` (decisions 1 to 3 of the faithful Material 3 stage). 1 dp = 1 component unit; the container density converts it to image pixels (`docs/COMPONENT-FORMAT.md`, "Units and density"). The values come from the specialization tokens (`tokens`, in the `light` and `dark` modes), which mirror the androidx token files; no color, font or radius is literal in the component.

**Files used**

- `compose/material3/material3/src/commonMain/kotlin/androidx/compose/material3/IconButton.kt` (lines 316 to 350: `IconToggleButtonImpl`, the same `Box` of `smallContainerSize()` as the `IconButton`, with `containerColor(enabled, checked)`).
- `compose/material3/material3/src/commonMain/kotlin/androidx/compose/material3/IconButtonDefaults.kt` (lines 215 to 232: colors of the `IconToggleButton`; 380 to 400: filled; 486 to 504: tonal; 687 to 708: outlined; 787 to 793: the outlined border disappears when checked; 849 to 880: `CornerFull` shape and `smallContainerSize` 40 by 40).
- `compose/material3/material3/src/commonMain/kotlin/androidx/compose/material3/tokens/SmallIconButtonTokens.kt` (`ContainerHeight` 40, `IconSize` 24, `OutlinedOutlineWidth` 1), `tokens/IconButtonTokens.kt`, `FilledIconButtonTokens.kt`, `FilledTonalIconButtonTokens.kt` and `OutlinedIconButtonTokens.kt` (checked and unchecked roles and disabled opacities).

**How the drawing follows Compose**

- A 40 by 40 container in the `corner-full` shape and a 24 icon centered, drawn by the `icon` node.
- Standard: no background; icon `on-surface` unchecked and `primary` checked.
- Filled: unchecked `surface-container` with an `on-surface-variant` icon; checked `primary` with `on-primary`.
- Tonal: unchecked `secondary-container` with `on-secondary-container`; checked `secondary` with `on-secondary`.
- Outlined: unchecked no background, `on-surface` icon and 1 outline in `on-surface`; checked `inverse-surface` with `inverse-on-surface` and **no outline** (`outlinedIconToggleButtonBorder` returns `null` when checked).
- Disabled: filled and tonal become `on-surface` at 0.1 on the container (checked or not); the icon and the outline go to 0.38 (`state-disabled-content`) over `on-surface`. In the disabled outlined the container is transparent also when checked, as in `defaultOutlinedIconToggleButtonColors`.

**Interaction state (`interaction` field)**

The field chooses the resting appearance of a state, as `enabled` chooses the disabled one; it does not go in the `code` or in the `variants`. The options are `none` and the states that the commit's `*IconButtonTokens.kt` define, split into checked (`Selected*`) and unchecked (`Unselected*`): `hovered`, `focused` and `pressed`; there is no `Dragged*` in the tokens, so there is no `dragged`.

- **State layer:** the `state` node is a `rect` in the button's shape (`corner-full`), between the outline and the icon, with the content color that the tokens give to the style and to the selection (`Selected{Hovered,Focused,Pressed}Color` and `Unselected{Hovered,Focused,Pressed}Color`): standard, checked `primary` and unchecked `on-surface-variant` (`IconButtonTokens.kt`, lines 28, 29, 31 and 32, 33, 35); filled, checked `on-primary` and unchecked `on-surface-variant` (`FilledIconButtonTokens.kt`, lines 32, 33, 35 and 37, 38, 40); tonal, checked `on-secondary` and unchecked `on-secondary-container` (`FilledTonalIconButtonTokens.kt`, lines 32, 33, 35 and 37, 38, 40); outlined, checked `inverse-on-surface` and unchecked `on-surface-variant` (`OutlinedIconButtonTokens.kt`, lines 33, 34, 36 and 38, 39, 42). The `opacity` comes from the tokens `state-hover` (0.08), `state-focus` (0.10) and `state-pressed` (0.10), which mirror `compose/material3/material3/src/commonMain/kotlin/androidx/compose/material3/tokens/StateTokens.kt` (lines 22 to 25: `HoverStateLayerOpacity`, `FocusStateLayerOpacity`, `PressedStateLayerOpacity`; `DraggedStateLayerOpacity` 0.16 is the `state-dragged`).
- **Elevation and outline:** the icon button tokens do not change the elevation or the outline color between states (the unchecked outlined outline is `OutlineVariant` in all three, `OutlinedIconButtonTokens.kt`, line 41, and disappears when checked); only the layer appears.
- **Disabled wins:** with `enabled` `false` the `state` node is invisible, so the drawing is the disabled one, whatever the `interaction`.

**What still differs from Compose**

- No animated ripple and no transition between states or animation of the color swap (the drawing is a still frame). Compose defines no focus ring for this type at the pinned commit (none of its `*Tokens.kt` has `FocusIndicatorColor`): none is drawn.
- The state layer of unchecked standard and outlined uses `on-surface-variant`, the color the tokens give to the state; the resting icon and outline stay in `on-surface`, so the layer does not have the same color as the icon in these two cases.
- The content of unchecked `standard` and unchecked `outlined` is the `LocalContentColor` (`IconButtonDefaults.kt`, lines 166 and 638): the drawing reads the inherited content color (`on-surface` with no parent) when the button is enabled. When checked, `filled` and `tonal` have their own content; the disabled one follows `on-surface`: these do not inherit.
- The disabled 0.1 on the container is literal in the component (the `state-disabled-container` token is 0.12).
- The shape of the checked state in Material expressive (`SelectedContainerShape*`) is not a field of the type; `shape` and `width` (width in dp) are fields and code, but the drawing does not use them; the `Narrow` and `Wide` widths have no field of their own.

**Accessibility** (stage #1081; the unit is the dp, 1 dp = 1 component unit): the type has `accessibility.role` `checkbox` and reads the accessible name from the `contentDescription` field. It declares `touchTarget` `expanded` (48 × 48, inherited from the root): Compose enlarges the touch area to the minimum with `minimumInteractiveComponentSize`, `compose/material3/material3/src/commonMain/kotlin/androidx/compose/material3/IconButton.kt` (line 327); the role is `compose/material3/material3/src/commonMain/kotlin/androidx/compose/material3/IconButton.kt` (line 335: `Role.Checkbox`), so the toggle is a `checkbox`, not a `switch`. The overlap of the expanded touch areas between neighbors is not audited (#1998).
