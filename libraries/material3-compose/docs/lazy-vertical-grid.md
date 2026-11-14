# LazyVerticalGrid

Scrollable vertical grid that composes only what is visible. Use it for galleries and catalogs in columns.

Annotation type: `lazy-vertical-grid` (Layout layer).

## Fields

| Key                 | Label                     | Type   | Required | Options                 | Default | Description                                                                                           |
| ------------------- | ------------------------- | ------ | -------- | ----------------------- | ------- | ----------------------------------------------------------------------------------------------------- |
| `columns`           | Columns                   | number | no       |                         | `2`     | Number of fixed columns (GridCells.Fixed).                                                            |
| `minColumnWidth`    | Minimum column width (dp) | number | no       |                         |         | If filled, the columns adapt to this width (GridCells.Adaptive) and the number of columns is ignored. |
| `verticalSpacing`   | Vertical spacing (dp)     | number | no       |                         |         | Space between the grid rows in dp (verticalArrangement).                                              |
| `horizontalSpacing` | Horizontal spacing (dp)   | number | no       |                         |         | Space between the grid columns in dp (horizontalArrangement).                                         |
| `contentPadding`    | Content padding (dp)      | number | no       |                         |         | Inner padding of the grid in dp (PaddingValues). Empty = 0.                                           |
| `width`             | Width                     | enum   | no       | `wrap`, `fill`, `fixed` | `wrap`  | wrap fits the content, fill takes all the available width and fixed uses the marking's width (dp).    |
| `height`            | Height                    | enum   | no       | `wrap`, `fill`, `fixed` | `wrap`  | wrap fits the content, fill takes all the available height and fixed uses the marking's height (dp).  |
| `weight`            | Weight                    | number | no       |                         |         | Share of the space left over in a Row or Column (Modifier.weight). Empty = no weight.                 |

## Compose

- Symbol: `androidx.compose.foundation.lazy.grid.LazyVerticalGrid`
- File (`path`): `compose/foundation/foundation/src/commonMain/kotlin/androidx/compose/foundation/lazy/grid/LazyGridDsl.kt`

How the annotation becomes the call (the values below are examples; the parameter names and the expressions are those of `params` and `values` in `code`):

```kotlin
LazyVerticalGrid(
    columns = GridCells.Fixed(2),            // minColumnWidth = 120: GridCells.Adaptive(120.dp)
    verticalArrangement = Arrangement.spacedBy(8.dp),
    horizontalArrangement = Arrangement.spacedBy(8.dp),
    contentPadding = PaddingValues(16.dp),
    modifier = Modifier.fillMaxSize(),
) {
    item { /* child 1 */ }
    item { /* child 2 */ }
}
```

Notes from `code` (what the tool hands to the agent):

> Pass `columns = GridCells.Fixed(<columns>)`; with `minColumnWidth` filled, use `GridCells.Adaptive(<minColumnWidth>.dp)` instead. Each child marking becomes an `item { … }` (identical, repeated children become `items(list) { … }`). `verticalSpacing` and `horizontalSpacing` become `Arrangement.spacedBy(<n>.dp)` in `verticalArrangement` and `horizontalArrangement`, and `contentPadding` becomes `PaddingValues(<contentPadding>.dp)`; the grid needs a bounded height. Size: `fill` becomes `Modifier.fillMaxWidth()`/`fillMaxHeight()`, `fixed` becomes `Modifier.width(<marking width>.dp)`/`height(<marking height>.dp)` and `weight` becomes `Modifier.weight(<weight>f)` (only inside a Row, Column or FlowRow).

## Examples

- **Two-column gallery**: columns=2, verticalSpacing=8, horizontalSpacing=8, contentPadding=16, width=fill, height=fill
- **Adaptive grid**: minColumnWidth=120, verticalSpacing=12, horizontalSpacing=12, width=fill, height=fill

## Fidelity

Reference: Compose `material3` 1.4.0, commit `5113b82a4ed6416d6344efa50e41db8cb65928ff` (decisions 1 to 3 of the faithful Material 3 stage). 1 dp = 1 component unit; the container's density converts it to image pixels (`docs/COMPONENT-FORMAT.md`, "Units and density"). This type belongs to Foundation, not to Material: it has no tokens file, and the drawing follows the foundation behavior, with the values coming from the fields.

**Files used**

- `compose/foundation/foundation/src/commonMain/kotlin/androidx/compose/foundation/lazy/grid/LazyGridDsl.kt` (lines 67 to 77: `LazyVerticalGrid(columns, contentPadding = PaddingValues(0.dp), reverseLayout = false, verticalArrangement, horizontalArrangement = Arrangement.Start)`; lines 325 to 335: `GridCells.Fixed(count)`, `n` equal columns; lines 354 to 366: `GridCells.Adaptive(minSize)`, `maxOf((availableSize + spacing) / (minSize + spacing), 1)` columns).
- `compose/foundation/foundation/src/commonMain/kotlin/androidx/compose/foundation/ScrollingContainer.kt` (line 56: the `clipScrollableContainer` that `LazyGrid.kt`, lines 125 to 150, applies through `scrollingContainer`).

**How the drawing follows Compose**

- The slot is a **grid** (`layout.type: "grid"`, format 4): `columns` gives `n` equal columns (the `GridCells.Fixed`) and, with `minColumnWidth` filled, the grid becomes adaptive, `max(1, floor((content + gap) / (minColumnWidth + gap)))` columns (the `GridCells.Adaptive`, the same calculation as `LazyGridDsl.kt`, line 363). The two fields become two track keys by expression and the one that has a value applies; `minColumnWidth` wins over `columns`, like the type's `code`.
- `horizontalSpacing` is the `gap` between the columns and `verticalSpacing` the `lineGap` between the rows; `contentPadding` is the slot's `padding`, inside the clipped box, like Compose's `PaddingValues`. **Arrange** puts each child in a cell, from left to right and from top to bottom (a child smaller than the cell stays at its start).
- The slot has `clip: true` (format 4): a child that goes past the component's box is clipped at the edge, like Compose's `clipScrollableContainer`.
- No color, font or radius is drawn; the slot's label shows only the size and the `weight` (the grid itself is drawn by the layout).

**What still differs from Compose**

- The columns have equal size (`1fr`): the format has no `GridCells.FixedSize` or cells of different widths, and a child does not take more than one column (a child marking's `span` does not exist; Compose's `GridItemSpan` is left out).
- `reverseLayout` is a field and code, but the drawing does not use it; the horizontal grid (`LazyHorizontalGrid`) is not a field of this type.
- The child keeps its own size inside the cell (the start of the cell); Compose hands it the cell width as the maximum constraint. Resize the child to fill the column.
- Scrolling and `state` do not exist in a static drawing: whatever goes past the box is clipped and there is no way to scroll to it. The children's `weight` is left out (Arrange does not read the children's fields).
