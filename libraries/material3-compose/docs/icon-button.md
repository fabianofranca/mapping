# Icon button

An icon-only button for an action (edit, add, more options). Standard, filled, tonal or outlined.

Annotation type: `icon-button` (Components layer).

## Fields

| Key                  | Label       | Type   | Required | Options                                                   | Default    | Description                                                                                                                                                                                                    |
| -------------------- | ----------- | ------ | -------- | --------------------------------------------------------- | ---------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `icon`               | Icon        | string | yes      | free text; icon suggestions (`Home`, `Search`, `Person`…) | `Favorite` | Icon of the button.                                                                                                                                                                                            |
| `contentDescription` | Description | string | no       |                                                           |            | Accessibility text of the button (goes in the Icon's `contentDescription`). Empty = no name for screen readers.                                                                                                |
| `style`              | Style       | enum   | no       | `standard`, `filled`, `tonal`, `outlined`                 | `standard` | standard (IconButton), filled (FilledIconButton), tonal (FilledTonalIconButton) or outlined (OutlinedIconButton).                                                                                              |
| `enabled`            | Enabled     | enum   | no       | `true`, `false`                                           | `true`     | false disables the button.                                                                                                                                                                                     |
| `interaction`        | Interaction | enum   | no       | `none`, `hovered`, `focused`, `pressed`                   | `none`     | Resting appearance of the interaction state: hovered, focused or pressed; none = no state layer. It only changes the drawing, it does not go in the code. With enabled false nothing is drawn (disabled wins). |

## Compose

- Symbol: `androidx.compose.material3.IconButton`
- File (`path`): `compose/material3/material3/src/commonMain/kotlin/androidx/compose/material3/IconButton.kt`
- The `style` field chooses the symbol; values without their own case use the base one.

| `style`           | Symbol                  |
| ----------------- | ----------------------- |
| `standard` (base) | `IconButton`            |
| `filled`          | `FilledIconButton`      |
| `tonal`           | `FilledTonalIconButton` |
| `outlined`        | `OutlinedIconButton`    |

How the annotation becomes the call (the values below are examples; the parameter names and expressions are those of `params` and `values` in `code`):

```kotlin
IconButton( // style filled: FilledIconButton, tonal: FilledTonalIconButton, outlined: OutlinedIconButton
    onClick = { /* screen logic */ },
    enabled = true,
) {
    Icon(Icons.Filled.Edit, contentDescription = "Edit")
}
```

Notes from `code` (what the tool hands to the agent):

> `onClick` connects to the screen logic and the icon goes in `content = { Icon(Icons.Filled.<icon>, contentDescription = <contentDescription>) }` (without `contentDescription`, pass `null`). The container is 40 dp with a full shape; no style requires an opt-in. 1.4.0 does not ship the icons: the app adds `androidx.compose.material:material-icons-core` (or `-extended`) or uses a Material Symbol with `painterResource`.

## Examples

- **Default**: icon=Edit, contentDescription=Edit, style=standard
- **Filled**: icon=Add, contentDescription=Add, style=filled
- **Disabled outlined**: icon=Settings, contentDescription=Settings, style=outlined, enabled=false
- **Hovered**: icon=Edit, contentDescription=Edit, style=standard, interaction=hovered
- **Focused**: icon=Settings, contentDescription=Settings, style=outlined, interaction=focused
- **Pressed**: icon=Add, contentDescription=Add, style=tonal, interaction=pressed

## Fidelity

Reference: Compose `material3` 1.4.0, commit `5113b82a4ed6416d6344efa50e41db8cb65928ff` (decisions 1 to 3 of the faithful Material 3 stage). 1 dp = 1 component unit; the container density converts it to image pixels (`docs/COMPONENT-FORMAT.md`, "Units and density"). The values come from the specialization tokens (`tokens`, in the `light` and `dark` modes), which mirror the androidx token files; no color, font or radius is literal in the component.

**Files used**

- `compose/material3/material3/src/commonMain/kotlin/androidx/compose/material3/IconButton.kt` (lines 164 to 193: `IconButtonImpl`, a `Box` of `smallContainerSize()` clipped and painted in the shape, with the content centered).
- `compose/material3/material3/src/commonMain/kotlin/androidx/compose/material3/IconButtonDefaults.kt` (lines 88 and 325 to 447: the default colors of the `IconButton` (content `LocalContentColor`), of the filled and of the tonal; 557 to 570: the outlined; 819 to 830: the outlined border, in the content color; 849 to 880: `CornerFull` shapes and `smallContainerSize` = 24 icon + 8 + 8 on each side by 40).
- `compose/material3/material3/src/commonMain/kotlin/androidx/compose/material3/tokens/SmallIconButtonTokens.kt` (`ContainerHeight` 40, `IconSize` 24, `DefaultLeadingSpace` 8, `OutlinedOutlineWidth` 1) and `tokens/FilledIconButtonTokens.kt`, `FilledTonalIconButtonTokens.kt`, `OutlinedIconButtonTokens.kt`, `IconButtonTokens.kt` (roles and disabled opacities: 0.1 on the container, 0.38 on the content).

**How the drawing follows Compose**

- A 40 by 40 container in the `corner-full` shape, with the 24 icon centered, drawn by the `icon` node (Compose name to set name, as in `icon`).
- Standard: no background and an `on-surface` icon. Filled: `primary` / `on-primary`. Tonal: `secondary-container` / `on-secondary-container`. Outlined: no background, icon and 1 outline in `on-surface` (the commit's `outlinedIconButtonBorder` uses the content color, not the `outline-variant` token).
- Disabled: filled and tonal become `on-surface` at 0.1 on the container; the icon and the outline go to 0.38 (`state-disabled-content`) over `on-surface`.

**Interaction state (`interaction` field)**

The field chooses the resting appearance of a state, as `enabled` chooses the disabled one; it does not go in the `code` or in the `variants`. The options are `none` and the states that the commit's `*IconButtonTokens.kt` define: `hovered` (`Hovered*`), `focused` (`Focused*`) and `pressed` (`Pressed*`); there is no `Dragged*` in the icon button tokens, so there is no `dragged`.

- **State layer:** the `state` node is a `rect` in the button's shape (`corner-full`), between the outline and the icon, with the content color of the style that the tokens give to the state: `on-surface-variant` in standard and outlined (`IconButtonTokens.kt` and `OutlinedIconButtonTokens.kt`, `HoveredColor`, `FocusedColor` and `PressedColor`, lines 24, 25 and 27 and 25, 26 and 29), `on-primary` in filled (`FilledIconButtonTokens.kt`, lines 27, 28 and 30) and `on-secondary-container` in tonal (`FilledTonalIconButtonTokens.kt`, lines 27, 28 and 30). The `opacity` comes from the tokens `state-hover` (0.08), `state-focus` (0.10) and `state-pressed` (0.10), which mirror `compose/material3/material3/src/commonMain/kotlin/androidx/compose/material3/tokens/StateTokens.kt` (lines 22 to 25: `HoverStateLayerOpacity`, `FocusStateLayerOpacity`, `PressedStateLayerOpacity`; `DraggedStateLayerOpacity` 0.16 is the `state-dragged`).
- **Elevation and outline:** the icon button tokens do not change the elevation or the outline color between states (the outlined outline is `OutlineVariant` in all three, `OutlinedIconButtonTokens.kt`, line 28); only the layer appears.
- **Disabled wins:** with `enabled` `false` the `state` node is invisible, so the drawing is the disabled one, whatever the `interaction`.

**What still differs from Compose**

- No animated ripple and no transition between states (the drawing is a still frame). Compose defines no focus ring for this type at the pinned commit (none of its `*Tokens.kt` has `FocusIndicatorColor`): none is drawn.
- The state layer of standard and outlined uses `on-surface-variant`, the color the tokens give to the state; the resting icon and outline stay in `on-surface` (the divergence above), so the layer does not have the same color as the icon in these two styles.
- The content of `standard` and `outlined` is the `LocalContentColor` (`IconButtonDefaults.kt`, lines 44 and 515): the drawing reads the inherited content color (`on-surface` with no parent) when the button is enabled. `filled` and `tonal` have their own content (`on-primary`, `on-secondary-container`) and the disabled one follows `on-surface`: these do not inherit.
- The disabled 0.1 on the container is literal in the component (the `state-disabled-container` token is 0.12).
- `shape` and `width` (width in dp) are fields and code, but the drawing does not use them; the `Narrow` and `Wide` widths have no field of their own.

**Accessibility** (stage #1081; the unit is the dp, 1 dp = 1 component unit): the type has `accessibility.role` `button` and reads the accessible name from the `contentDescription` field. It declares `touchTarget` `expanded` (48 × 48, inherited from the root): Compose enlarges the touch area to the minimum with `minimumInteractiveComponentSize`, `compose/material3/material3/src/commonMain/kotlin/androidx/compose/material3/IconButton.kt` (line 178); the role is `compose/material3/material3/src/commonMain/kotlin/androidx/compose/material3/IconButton.kt` (line 185: `Role.Button`). The overlap of the expanded touch areas between neighbors is not audited (#1998).
