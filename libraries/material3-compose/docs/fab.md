# FAB

A floating action button for the screen's main action. Small, regular or large.

Annotation type: `fab` (Components layer).

## Fields

| Key                  | Label        | Type   | Required | Options                                                   | Default            | Description                                                                                                                                                                                                                   |
| -------------------- | ------------ | ------ | -------- | --------------------------------------------------------- | ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `icon`               | Icon         | string | yes      | free text; icon suggestions (`Home`, `Search`, `Person`…) | `Add`              | Icon of the button.                                                                                                                                                                                                           |
| `contentDescription` | Description  | string | no       |                                                           |                    | Accessibility text of the button.                                                                                                                                                                                             |
| `size`               | Size         | enum   | no       | `small`, `regular`, `large`                               | `regular`          | small (40 dp), regular (56 dp) or large (96 dp).                                                                                                                                                                              |
| `containerColor`     | Button color | enum   | no       | `ColorScheme` roles                                       | `primaryContainer` | Theme color role used for the button background.                                                                                                                                                                              |
| `interaction`        | Interaction  | enum   | no       | `none`, `hovered`, `focused`, `pressed`                   | `none`             | Resting appearance of the interaction state: hovered, focused or pressed; none = no state layer. It only changes the drawing, it does not go in the code. The FAB has no disabled state (no enabled): the state always draws. |

## Compose

- Symbol: `androidx.compose.material3.FloatingActionButton`
- File (`path`): `compose/material3/material3/src/commonMain/kotlin/androidx/compose/material3/FloatingActionButton.kt`
- The `size` field chooses the symbol; values without their own case use the base one.

| `size`           | Symbol                      |
| ---------------- | --------------------------- |
| `regular` (base) | `FloatingActionButton`      |
| `small`          | `SmallFloatingActionButton` |
| `large`          | `LargeFloatingActionButton` |

How the annotation becomes the call (the values below are examples; the parameter names and expressions are those of `params` and `values` in `code`):

```kotlin
FloatingActionButton( // size small: SmallFloatingActionButton, large: LargeFloatingActionButton
    onClick = { /* screen logic */ },
    containerColor = MaterialTheme.colorScheme.primaryContainer,
) {
    Icon(Icons.Filled.Add, contentDescription = "Add")
}
```

Notes from `code` (what the tool hands to the agent):

> The icon goes in `content = { Icon(Icons.Filled.<icon>, contentDescription = <contentDescription>) }` and `onClick` connects to the screen logic. `size` swaps the composable (Small, regular, Large). Inside a Scaffold, the FAB goes in `floatingActionButton`. Since material3 1.4.0 the icons require `androidx.compose.material:material-icons-core` (or `-extended`) or a Material Symbol downloaded with `painterResource`; the ones that mirror (ArrowBack, KeyboardArrowRight, List) live in `Icons.AutoMirrored.Filled`.

## Examples

- **Add**: icon=Add, contentDescription=Add, size=regular
- **Small tertiary**: icon=Edit, contentDescription=Edit, size=small, containerColor=tertiaryContainer
- **Large**: icon=Add, contentDescription=Add, size=large
- **Hovered**: icon=Add, contentDescription=Add, size=regular, interaction=hovered
- **Focused**: icon=Edit, contentDescription=Edit, size=small, containerColor=tertiaryContainer, interaction=focused
- **Pressed**: icon=Add, contentDescription=Add, size=large, interaction=pressed

## Fidelity

Reference: Compose `material3` 1.4.0, commit `5113b82a4ed6416d6344efa50e41db8cb65928ff` (decisions 1 to 3 of the faithful Material 3 stage). 1 dp = 1 component unit; the container density converts it to image pixels (`docs/COMPONENT-FORMAT.md`, "Units and density"). The values come from the specialization tokens (`tokens`, in the `light` and `dark` modes), which mirror the androidx token files; no color, font or radius is literal in the component.

**Files used**

- `compose/material3/material3/src/commonMain/kotlin/androidx/compose/material3/FloatingActionButton.kt`: the `FloatingActionButton` (lines 109 to 132: `shape`, `containerColor`, `contentColor = contentColorFor(containerColor)`, `elevation`), the common body (lines 134 to 169: a `Surface` with `shadowElevation` and a `Box` with `defaultMinSize` and centered content), the `SmallFloatingActionButton` (lines 199 to 224, minimum `FabSmallTokens`), the `LargeFloatingActionButton` (lines 254 to 280, minimum `FabLargeTokens`) and `FloatingActionButtonDefaults` (lines 507 to 555: `LargeIconSize = 36.dp` on line 510, the shapes on lines 513 to 523, `containerColor` on 530 and `elevation()` with the values of `FabPrimaryContainerTokens`).
- `compose/material3/material3/src/commonMain/kotlin/androidx/compose/material3/tokens/FabBaselineTokens.kt` (56 dp, `CornerLarge`, icon 24), `FabSmallTokens.kt` (40 dp, `CornerMedium`, icon 24) and `FabLargeTokens.kt` (96 dp, `CornerExtraLarge`, icon 32).
- `compose/material3/material3/src/commonMain/kotlin/androidx/compose/material3/tokens/FabPrimaryContainerTokens.kt` (lines 21 to 31: `ContainerColor = PrimaryContainer`, `ContainerElevation = Level3`, `IconColor = OnPrimaryContainer`) and `ElevationTokens.kt` (`Level3 = 6.dp`).
- `compose/material3/material3/src/commonMain/kotlin/androidx/compose/material3/ColorScheme.kt` (lines 1064 to 1092: `contentColorFor`, which matches the container role with the content color role; lines 1112 to 1115: the composable `contentColorFor`, which falls back to `LocalContentColor`).
- `ColorLightTokens.kt` and `ColorDarkTokens.kt` (the `containerColor` roles) and `ShapeTokens.kt` (`corner-medium` 12, `corner-large` 16, `corner-extra-large` 28).

**How the drawing follows Compose**

- The regular is 56 with `corner-large`; the small, `corner-medium`; the large, `corner-extra-large` (the box comes from the marking, the drawing only picks the radius by the `size` field).
- The background color is the `containerColor` role (default `primary-container`), in both modes through the role's token. The icon uses the content color that `contentColorFor` returns for the role (`primary-container` -> `on-primary-container`, `primary` -> `on-primary`, `inverse-surface` -> `inverse-on-surface`, `surface-container-*` -> `on-surface`…); roles that Compose does not match fall back to `on-surface`, the theme's `LocalContentColor`.
- The icon is the `icon` node of the library's set, with the Compose name (`Add`) swapped for the set's name (`add`) in a `$switch` that covers the field's suggestions; it is 24, and 36 in the large (`LargeIconSize` of the `Defaults`, which the `.kt` itself marks as different from the 32 token).
- The shadow is that of elevation level 3 (`ContainerElevation`, 6 dp): the two level 3 shadows (point: `y` 1, `blur` 3; ambient: `y` 4, `blur` 8, `spread` 3; tokens `elevation-3-point-*` and `elevation-3-ambient-*`). Material 3 elevation values for the web: `elevation/internal/_elevation.scss` of `material-components/material-web` (version 2.5.0, commit `37aa14b843dcaeb3a46f898679fa6fcd109b1905`), a source outside Compose, which on Android hands the elevation to the platform and does not carry the numbers: point shadow in black at 30% and ambient shadow in black at 15%, with `y`, `blur` and `spread` per level (tokens `elevation-<n>-point-*` and `elevation-<n>-ambient-*`).

**Interaction state (`interaction` field)**

The field chooses the resting appearance of a state, as `size` chooses the size; it does not go in the `code` or in the `variants`. The options are `none` and the states that the commit's `FabPrimaryContainerTokens.kt` defines: `hovered`, `focused` and `pressed` (there is no `Dragged*` in the FAB tokens, so there is no `dragged`). Compose's FAB has no `enabled`, so there is no disabled state: the state always draws.

- **State layer:** the `state` node is a `rect` in the button's shape (the same as each `size`: `corner-medium`, `corner-large` or `corner-extra-large`), between the background and the icon, with the content color of the `containerColor` (the same as the icon: `on-primary-container` by default; `FocusedIconColor`, `HoveredIconColor` and `PressedIconColor` repeat `OnPrimaryContainer` on lines 25, 27 and 30 of `compose/material3/material3/src/commonMain/kotlin/androidx/compose/material3/tokens/FabPrimaryContainerTokens.kt`) and `opacity` from the tokens `state-hover` (0.08), `state-focus` (0.10) and `state-pressed` (0.10), which mirror `compose/material3/material3/src/commonMain/kotlin/androidx/compose/material3/tokens/StateTokens.kt` (lines 22 to 25: `HoverStateLayerOpacity`, `FocusStateLayerOpacity`, `PressedStateLayerOpacity`; `DraggedStateLayerOpacity` 0.16 is the `state-dragged`).
- **Elevation per state** (`FabPrimaryContainerTokens.kt`, lines 23 to 29): hovered rises from level 3 to 4 (`HoveredContainerElevation = Level4`, line 26; `ElevationTokens.kt`, line 28: 8 dp); focused and pressed stay at level 3 (`FocusedContainerElevation` and `PressedContainerElevation`, lines 24 and 29). The shadow accepts `$token` in `y` and `blur`, but not an expression, so the level 4 one (the two shadows of `elevation-4-point-*` and `elevation-4-ambient-*`) belongs to a separate node (`elevated shadow`, with the same background and the same shape, visible only when hovered) and the container's shadow disappears in that state. Focused and pressed draw the same (same opacity, 0.10, and same level).

**What still differs from Compose**

- The two shadows come from the tokens `elevation-3-point-*` and `elevation-3-ambient-*` (that of the `elevated shadow` node, from `elevation-4-*`), by `$token`: changing these tokens in the specialization reaches the drawing.
- The shadow has both lights (point and ambient), like Material 3 elevation for the web; the `FloatingActionButton`'s tonal elevation over the container is not drawn.
- No animated ripple and no transition between states (the drawing is a still frame). Compose defines no focus ring for this type at the pinned commit (none of its `*Tokens.kt` has `FocusIndicatorColor`): none is drawn.
- The icon comes from a fixed list of names; the `FloatingActionButton` accepts any `@Composable` as content.
