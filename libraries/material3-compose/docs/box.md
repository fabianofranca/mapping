# Box

Stacks its children on top of each other and positions them by alignment. Use it for overlays, icons over images and background areas.

Annotation type: `box` (Layout layer).

## Fields

| Key                | Label             | Type   | Required | Options                                                                                                             | Default    | Description                                                                                        |
| ------------------ | ----------------- | ------ | -------- | ------------------------------------------------------------------------------------------------------------------- | ---------- | -------------------------------------------------------------------------------------------------- |
| `contentAlignment` | Content alignment | enum   | no       | `TopStart`, `TopCenter`, `TopEnd`, `CenterStart`, `Center`, `CenterEnd`, `BottomStart`, `BottomCenter`, `BottomEnd` | `TopStart` | Where the children sit inside the Box (Alignment).                                                 |
| `background`       | Background        | enum   | no       | `none` and `ColorScheme` roles                                                                                      | `none`     | Theme color role used as the background (Modifier.background). none = no background.               |
| `padding`          | Padding (dp)      | number | no       |                                                                                                                     |            | Modifier.padding in dp. Empty = 0.                                                                 |
| `width`            | Width             | enum   | no       | `wrap`, `fill`, `fixed`                                                                                             | `wrap`     | wrap fits the content, fill takes all the available width and fixed uses the marking width (dp).   |
| `height`           | Height            | enum   | no       | `wrap`, `fill`, `fixed`                                                                                             | `wrap`     | wrap fits the content, fill takes all the available height and fixed uses the marking height (dp). |
| `weight`           | Weight            | number | no       |                                                                                                                     |            | Share of the leftover space in a Row or Column (Modifier.weight). Empty = no weight.               |

## Compose

- Symbol: `androidx.compose.foundation.layout.Box`
- File (`path`): `compose/foundation/foundation-layout/src/commonMain/kotlin/androidx/compose/foundation/layout/Box.kt`

How the annotation becomes the call (the values below are examples; the parameter names and expressions are those of `params` and `values` in the `code`):

```kotlin
Box(
    contentAlignment = Alignment.Center,
    modifier = Modifier
        .fillMaxWidth()
        .height(120.dp)
        .background(MaterialTheme.colorScheme.primaryContainer)
        .padding(16.dp),
) {
    /* stacked children; each can have Modifier.align(...) */
}
```

Notes from the `code` (what the tool hands to the agent):

> The children go in the `content`, stacked in order; each can have `Modifier.align(...)`. `background` becomes `Modifier.background(<color>)` (omit it with `none`) and `padding` becomes `Modifier.padding(<padding>.dp)`, in that order after the size. Size: `fill` becomes `Modifier.fillMaxWidth()`/`fillMaxHeight()`, `fixed` becomes `Modifier.width(<marking width>.dp)`/`height(<marking height>.dp)` and `weight` becomes `Modifier.weight(<weight>f)` (only inside Row, Column or FlowRow).

## Examples

- **Centered overlay**: contentAlignment=Center, background=primaryContainer, padding=16, width=fill, height=fixed
- **Corner**: contentAlignment=TopEnd, background=none

## Fidelity

Reference: Compose `material3` 1.4.0, commit `5113b82a4ed6416d6344efa50e41db8cb65928ff` (decisions 1 to 3 of the faithful Material 3 stage). 1 dp = 1 component unit; the container density converts to image pixels (`docs/COMPONENT-FORMAT.md`, "Units and density"). The values come from the specialization tokens (`tokens`, in the `light` and `dark` modes), which mirror the androidx token files; no color, font or radius is literal in the component.

**Files used**

- `compose/foundation/foundation-layout/src/commonMain/kotlin/androidx/compose/foundation/layout/Box.kt` (lines 65 to 70: `Box(contentAlignment = Alignment.TopStart, propagateMinConstraints = false)`; no size `Defaults`: the Box measures the content).
  `ColorLightTokens.kt` and `ColorDarkTokens.kt`: the theme color roles, read as tokens (`$token`) in both modes.

**How the drawing follows Compose**

- `background` and the fill follow the theme role in both modes; `none` draws no background (`Modifier.background` is optional).
- The `padding` insets the content area (the background covers the whole Box, like `Modifier.background(...).padding(...)`).
- The default of `contentAlignment` is `TopStart`, that of `Box.kt`.
- `contentAlignment` becomes the slot's `align` (vertical) and `justify` (horizontal), which is now an aligned `layout: none` (format 4): `Top*`, `Center*` and `Bottom*` give `start`, `center` and `end` in height, and `*Start`, `*Center` and `*End` give the same in width, through a `$switch` on the field. **Arrange** puts each child alone in the slot box by the alignment (the children remain overlapped, as in `BoxMeasurePolicy`, `Box.kt` lines 80 to 90 and 124 to 220, where `Alignment.align` positions each child); with `TopStart` Arrange does not move the children, each stays where the person marked it.
- `height` `fill` or `fixed` keeps the marking height in Arrange, which is where the vertical alignment shows; with `wrap` (the default) the Box hugs the children and the height is that of the tallest.

**What still differs from Compose**

- The alignment only acts when the person asks for **Arrange**: when marking a new child, it stays where it was marked, and moving a child by hand takes it out of the alignment until the next Arrange. Compose aligns at every measurement.
- The per-child `Modifier.align(...)` (`BoxScope.align`, `Box.kt` line 249) does not exist: `contentAlignment` applies to all the children; for a child outside the rule, leave `TopStart` and position it by hand.
- `weight` only shows in the label: Arrange does not read the children's fields (the format's `weight` belongs to template nodes).
- `propagateMinConstraints` is a field and code, but the drawing does not use it; the parent's minimum constraints are not fields of the type.
