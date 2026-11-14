# Row

Places the children in a row, from left to right. Use it for action bars, icon and text pairs and any row of components.

Annotation type: `row` (Layout layer).

## Fields

| Key                     | Label                  | Type   | Required | Options                                                                | Default | Description                                                                                                      |
| ----------------------- | ---------------------- | ------ | -------- | ---------------------------------------------------------------------- | ------- | ---------------------------------------------------------------------------------------------------------------- |
| `horizontalArrangement` | Horizontal arrangement | enum   | no       | `Start`, `End`, `Center`, `SpaceBetween`, `SpaceAround`, `SpaceEvenly` | `Start` | How the children are distributed on the horizontal axis (Arrangement).                                           |
| `verticalAlignment`     | Vertical alignment     | enum   | no       | `Top`, `CenterVertically`, `Bottom`                                    | `Top`   | How the children are aligned on the vertical axis (Alignment).                                                   |
| `spacing`               | Spacing (dp)           | number | no       |                                                                        |         | Space between the children in dp (Arrangement.spacedBy). Empty = 0.                                              |
| `background`            | Background             | enum   | no       | `none` and the `ColorScheme` roles                                     | `none`  | Theme color role used as the background (Modifier.background). none = no background.                             |
| `padding`               | Padding (dp)           | number | no       |                                                                        |         | Modifier.padding in dp. Empty = 0.                                                                               |
| `scroll`                | Scroll                 | enum   | no       | `false`, `true`                                                        | `false` | true makes the content scrollable without using lazy (verticalScroll/horizontalScroll with rememberScrollState). |
| `width`                 | Width                  | enum   | no       | `wrap`, `fill`, `fixed`                                                | `wrap`  | wrap fits the content, fill takes all the available width and fixed uses the marking's width (dp).               |
| `height`                | Height                 | enum   | no       | `wrap`, `fill`, `fixed`                                                | `wrap`  | wrap fits the content, fill takes all the available height and fixed uses the marking's height (dp).             |
| `weight`                | Weight                 | number | no       |                                                                        |         | Share of the space left over in a Row or Column (Modifier.weight). Empty = no weight.                            |

## Compose

- Symbol: `androidx.compose.foundation.layout.Row`
- File (`path`): `compose/foundation/foundation-layout/src/commonMain/kotlin/androidx/compose/foundation/layout/Row.kt`

How the annotation becomes the call (the values below are examples; the parameter names and the expressions are those of `params` and `values` in `code`):

```kotlin
Row(
    horizontalArrangement = Arrangement.SpaceBetween,
    verticalAlignment = Alignment.CenterVertically,
    modifier = Modifier.fillMaxWidth(),
) {
    /* children */
}

// with spacing = 8: horizontalArrangement = Arrangement.spacedBy(8.dp)
// with scroll = true: Modifier.horizontalScroll(rememberScrollState())
```

Notes from `code` (what the tool hands to the agent):

> The children go in the `content`. With `spacing`, pass `Arrangement.spacedBy(<spacing>.dp)` in place of `horizontalArrangement` (to keep Center or End use `Arrangement.spacedBy(<spacing>.dp, Alignment.CenterHorizontally)` or `Alignment.End`). Build the `modifier` in the order size, `background`, `padding` and, with `scroll = true`, `Modifier.horizontalScroll(rememberScrollState())`. Size: `fill` becomes `Modifier.fillMaxWidth()`/`fillMaxHeight()`, `fixed` becomes `Modifier.width(<marking width>.dp)`/`height(<marking height>.dp)` and `weight` becomes `Modifier.weight(<weight>f)` (only inside a Row, Column or FlowRow).

## Examples

- **Action bar**: horizontalArrangement=SpaceBetween, verticalAlignment=CenterVertically, width=fill
- **Spaced row**: horizontalArrangement=Start, verticalAlignment=CenterVertically, spacing=8, padding=16
- **Horizontal scroll**: scroll=true, spacing=12, width=fill

## Fidelity

Reference: Compose `material3` 1.4.0, commit `5113b82a4ed6416d6344efa50e41db8cb65928ff` (decisions 1 to 3 of the faithful Material 3 stage). 1 dp = 1 component unit; the container's density converts it to image pixels (`docs/COMPONENT-FORMAT.md`, "Units and density"). The values come from the specialization's tokens (`tokens`, in the `light` and `dark` modes), which mirror the androidx tokens files; no color, font or radius is left literal in the component.

**Files used**

- `compose/foundation/foundation-layout/src/commonMain/kotlin/androidx/compose/foundation/layout/Row.kt` (lines 94 to 98: `Row(horizontalArrangement = Arrangement.Start, verticalAlignment = Alignment.Top)`).
  `ColorLightTokens.kt` and `ColorDarkTokens.kt`: the theme color roles, read as tokens (`$token`) in both modes.

**How the drawing follows Compose**

- `horizontalArrangement` becomes the `justify` of the slot's layout (`Start` to `start`, `End` to `end`, `Center` to `center`, `SpaceBetween` to `space-between`) and `verticalAlignment` becomes the `align` (`Top` to `start`, `CenterVertically` to `center`, `Bottom` to `end`); before, the slot was always at `start`.
- `spacing` is the `gap` (`Arrangement.spacedBy`) and `padding` is the slot's inset, after the background, as in the order of the `Modifier`s.
- The background follows the theme role in both modes; `none` draws no background.
- The slot has `clip: true` (format 4): a child that goes past the component's box is clipped at the edge. Compose's `Row` does not clip (`Row.kt` lines 94 to 106: only the `Layout` with the `measurePolicy`, without `clipToBounds`); what keeps the child from going past are the measure constraints, which the format does not have. The clip is the visual approximation of those constraints.

**What still differs from Compose**

- `SpaceAround` and `SpaceEvenly` become `space-around` and `space-evenly` of the `justify`.
- `scroll` only appears in the label: scrolling is not drawn.
- Compose limits the children to the Row's width through the measure constraints (a 300 dp child in a 200 dp Row measures 200); the format clips whatever goes past the box, instead of shrinking the child. Scrolling does not exist. The children's `weight` is left out: Arrange does not read the children's fields.
