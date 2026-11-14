# Surface

Surface with color, shape and tonal elevation that groups content. Use it for panels, simple cards and areas with their own background.

Annotation type: `surface` (layer Layout).

## Fields

| Key              | Label                | Type   | Required | Options                                                        | Default   | Description                                                                                        |
| ---------------- | -------------------- | ------ | -------- | -------------------------------------------------------------- | --------- | -------------------------------------------------------------------------------------------------- |
| `color`          | Color                | enum   | no       | `ColorScheme` roles                                            | `surface` | Theme color role used as the surface color.                                                        |
| `shape`          | Shape                | enum   | no       | `none`, `extraSmall`, `small`, `medium`, `large`, `extraLarge` | `none`    | Shape of the surface clip. none = rectangle.                                                       |
| `tonalElevation` | Tonal elevation (dp) | number | no       |                                                                |           | Tonal elevation in dp (tonalElevation). Empty = 0.                                                 |
| `width`          | Width                | enum   | no       | `wrap`, `fill`, `fixed`                                        | `wrap`    | wrap fits the content, fill takes all the available width and fixed uses the marking width (dp).   |
| `height`         | Height               | enum   | no       | `wrap`, `fill`, `fixed`                                        | `wrap`    | wrap fits the content, fill takes all the available height and fixed uses the marking height (dp). |
| `weight`         | Weight               | number | no       |                                                                |           | Share of the leftover space in a Row or Column (Modifier.weight). Empty = no weight.               |

## Compose

- Symbol: `androidx.compose.material3.Surface`
- File (`path`): `compose/material3/material3/src/commonMain/kotlin/androidx/compose/material3/Surface.kt`

How the annotation becomes the call (the values below are examples; the parameter names and expressions are those of `params` and `values` in `code`):

```kotlin
Surface(
    color = MaterialTheme.colorScheme.surfaceContainer,
    shape = MaterialTheme.shapes.medium,
    tonalElevation = 1.dp,
    modifier = Modifier.fillMaxWidth(),
) {
    Column { /* a single root node */ }
}
```

`code` notes (what the tool hands to the agent):

> The children go in the `content`, which accepts a single root node (use Row, Column or Box for several). `tonalElevation` goes in as `tonalElevation = <tonalElevation>.dp` only when filled. Size: `fill` becomes `Modifier.fillMaxWidth()`/`fillMaxHeight()`, `fixed` becomes `Modifier.width(<marking width>.dp)`/`height(<marking height>.dp)` and `weight` becomes `Modifier.weight(<weight>f)` (only inside Row, Column or FlowRow).

## Examples

- **Panel**: color=surfaceContainer, shape=medium, tonalElevation=1
- **Full screen**: color=background, shape=none, width=fill, height=fill

## Fidelity

Reference: Compose `material3` 1.4.0, commit `5113b82a4ed6416d6344efa50e41db8cb65928ff` (decisions 1 to 3 of the faithful Material 3 stage). 1 dp = 1 component unit; the container density converts it to image pixels (`docs/COMPONENT-FORMAT.md`, "Units and density"). The values come from the specialization tokens (`tokens`, in the `light` and `dark` modes), which mirror the androidx token files; no color, font or radius is literal in the component.

**Files used**

- `compose/material3/material3/src/commonMain/kotlin/androidx/compose/material3/Surface.kt` (lines 96 to 105: `Surface(shape = RectangleShape, color = MaterialTheme.colorScheme.surface, tonalElevation = 0.dp, shadowElevation = 0.dp)`).
- `compose/material3/material3/src/commonMain/kotlin/androidx/compose/material3/ColorScheme.kt` (lines 1125 to 1129: `surfaceColorAtElevation`, which covers the `surface` color with the `surfaceTint` at opacity `(4.5 × ln(elevation + 1) + 2) / 100`; lines 1540 to 1547: `applyTonalElevation`, which only applies tonal elevation when the color is `surface`).
- `compose/material3/material3/src/commonMain/kotlin/androidx/compose/material3/tokens/ShapeTokens.kt`: the radii `CornerExtraSmall` (4), `CornerSmall` (8), `CornerMedium` (12), `CornerLarge` (16) and `CornerExtraLarge` (28).
- `ColorLightTokens.kt` and `ColorDarkTokens.kt`: the `color` roles and the `surface-tint`.

**How the drawing follows Compose**

- The shape reads `corner-extra-small` to `corner-extra-large`; `none` is `corner-none` (rectangle).
- Tonal elevation is the `surface-tint` overlaid on the `surface` color, with the opacity of the formula above (0.051 at 1 dp up to 0.136 at 12 dp), and **only appears when `color` is `surface`**, as in `applyTonalElevation`. The other colors stay as they are.
- The same formula applies in both modes; the base color and the `surface-tint` change with the mode.

**What still differs from Compose**

- Tonal elevation is a table by integer from 1 to 12 dp (the formula uses `ln`, which the expression format does not compute); another value uses 0.14.
- Inherited content color (decision 14): the `surface` and the `scaffold` offer the `contentColorFor` of the background color in the slot (`provide` of `content-color`; `ColorScheme.kt`, lines 1064 to 1092, `ColorScheme.contentColorFor`, and 1112 to 1115, which falls back to the inherited `LocalContentColor` when the color has no pair); `Surface.kt`, lines 100 and 108 (`contentColor = contentColorFor(color)` and `LocalContentColor provides contentColor`). The text, the icon and the icon button inside it read this value (see `text`, `icon`, `icon-button` and `icon-toggle-button`); a color with no pair (`outline`, `scrim`, the `on-*` roles…) inherits what the parent offered, and with no parent it is `on-surface`.
- `onClick` of the `Surface` is not a field of the type.
- Decision of the Material 3 with interaction states stage (decision 12, 2026-11-08): the reading of the pinned commit's `Surface.kt` stays (the `surface-tint` over `surface`, by the `tonalElevation`), which M1 followed. Decision 8 of the faithful Material 3 stage (the `surface-container-*` roles) applies to the components that use those roles (`card`, `list-item`, `navigation-bar`, among others), not to the tonal elevation of the `surface`. The component does not change.
