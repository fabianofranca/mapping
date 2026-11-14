# Column

Places the children in a column, from top to bottom. Use it for content blocks, forms and any vertical stack.

Annotation type: `column` (Layout layer).

## Fields

| Key                   | Label                | Type   | Required | Options                                                                 | Default | Description                                                                                                      |
| --------------------- | -------------------- | ------ | -------- | ----------------------------------------------------------------------- | ------- | ---------------------------------------------------------------------------------------------------------------- |
| `verticalArrangement` | Vertical arrangement | enum   | no       | `Top`, `Bottom`, `Center`, `SpaceBetween`, `SpaceAround`, `SpaceEvenly` | `Top`   | How the children are distributed on the vertical axis (Arrangement).                                             |
| `horizontalAlignment` | Horizontal alignment | enum   | no       | `Start`, `CenterHorizontally`, `End`                                    | `Start` | How the children are aligned on the horizontal axis (Alignment).                                                 |
| `spacing`             | Spacing (dp)         | number | no       |                                                                         |         | Space between the children in dp (Arrangement.spacedBy). Empty = 0.                                              |
| `background`          | Background           | enum   | no       | `none` and `ColorScheme` roles                                          | `none`  | Theme color role used as the background (Modifier.background). none = no background.                             |
| `padding`             | Padding (dp)         | number | no       |                                                                         |         | Modifier.padding in dp. Empty = 0.                                                                               |
| `scroll`              | Scroll               | enum   | no       | `false`, `true`                                                         | `false` | true makes the content scrollable without using lazy (verticalScroll/horizontalScroll with rememberScrollState). |
| `width`               | Width                | enum   | no       | `wrap`, `fill`, `fixed`                                                 | `wrap`  | wrap fits the content, fill takes all the available width and fixed uses the marking width (dp).                 |
| `height`              | Height               | enum   | no       | `wrap`, `fill`, `fixed`                                                 | `wrap`  | wrap fits the content, fill takes all the available height and fixed uses the marking height (dp).               |
| `weight`              | Weight               | number | no       |                                                                         |         | Share of the leftover space in a Row or Column (Modifier.weight). Empty = no weight.                             |

## Compose

- Symbol: `androidx.compose.foundation.layout.Column`
- File (`path`): `compose/foundation/foundation-layout/src/commonMain/kotlin/androidx/compose/foundation/layout/Column.kt`

How the annotation becomes the call (the values below are examples; the parameter names and expressions are those of `params` and `values` in the `code`):

```kotlin
Column(
    verticalArrangement = Arrangement.spacedBy(8.dp),
    horizontalAlignment = Alignment.Start,
    modifier = Modifier
        .fillMaxWidth()
        .verticalScroll(rememberScrollState())
        .padding(16.dp),
) {
    /* children */
}
```

Notes from the `code` (what the tool hands to the agent):

> The children go in the `content`. With `spacing`, pass `Arrangement.spacedBy(<spacing>.dp)` in place of `verticalArrangement` (to keep Center or Bottom use `Arrangement.spacedBy(<spacing>.dp, Alignment.CenterVertically)` or `Alignment.Bottom`). Build the `modifier` in the order size, `background`, `padding` and, with `scroll = true`, `Modifier.verticalScroll(rememberScrollState())`. Size: `fill` becomes `Modifier.fillMaxWidth()`/`fillMaxHeight()`, `fixed` becomes `Modifier.width(<marking width>.dp)`/`height(<marking height>.dp)` and `weight` becomes `Modifier.weight(<weight>f)` (only inside Row, Column or FlowRow).

## Examples

- **Spaced stack**: verticalArrangement=Top, horizontalAlignment=Start, spacing=8, padding=16, width=fill
- **Centered content**: verticalArrangement=Center, horizontalAlignment=CenterHorizontally, width=fill, height=fill
- **With scrolling**: spacing=16, scroll=true, width=fill, height=fill

## Fidelity

Reference: Compose `material3` 1.4.0, commit `5113b82a4ed6416d6344efa50e41db8cb65928ff` (decisions 1 to 3 of the faithful Material 3 stage). 1 dp = 1 component unit; the container density converts to image pixels (`docs/COMPONENT-FORMAT.md`, "Units and density"). The values come from the specialization tokens (`tokens`, in the `light` and `dark` modes), which mirror the androidx token files; no color, font or radius is literal in the component.

**Files used**

- `compose/foundation/foundation-layout/src/commonMain/kotlin/androidx/compose/foundation/layout/Column.kt` (lines 82 to 86: `Column(verticalArrangement = Arrangement.Top, horizontalAlignment = Alignment.Start)`).
  `ColorLightTokens.kt` and `ColorDarkTokens.kt`: the theme color roles, read as tokens (`$token`) in both modes.

**How the drawing follows Compose**

- `verticalArrangement` becomes the slot layout's `justify` (`Top` to `start`, `Bottom` to `end`, `Center` to `center`, `SpaceBetween` to `space-between`) and `horizontalAlignment` becomes the `align` (`Start` to `start`, `CenterHorizontally` to `center`, `End` to `end`); before, the slot was always at `start`.
- `spacing` is the `gap` (`Arrangement.spacedBy`) and `padding` the slot's inset, after the background, as in the order of the `Modifier`s.
- The background follows the theme role in both modes; `none` draws no background.
- The slot has `clip: true` (format 4): a child that goes past the component box is cut at the edge. Compose's `Column` does not clip (`Column.kt` lines 82 to 94: only the `Layout` with the `measurePolicy`, without `clipToBounds`); what stops the child from going past are the measurement constraints, which the format does not have. The clip is the visual approximation of those constraints.

**What still differs from Compose**

- `SpaceAround` and `SpaceEvenly` become `space-around` and `space-evenly` of the `justify`.
- `scroll` only shows in the label: scrolling is not drawn.
- Compose limits the children to the Column height through the measurement constraints (a 300 dp child in a 200 dp Column measures 200); the format cuts what goes past the box, instead of shrinking the child. Scrolling does not exist. The children's `weight` is left out: Arrange does not read the children's fields.
