# LazyColumn

Scrollable vertical list that composes only what is visible. Use it for long lists of List items, cards or rows.

Annotation type: `lazy-column` (Layout layer).

## Fields

| Key                   | Label                      | Type   | Required | Options                                                                 | Default | Description                                                                                                                                                                                      |
| --------------------- | -------------------------- | ------ | -------- | ----------------------------------------------------------------------- | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `verticalArrangement` | Vertical arrangement       | enum   | no       | `Top`, `Bottom`, `Center`, `SpaceBetween`, `SpaceAround`, `SpaceEvenly` | —       | How the items are distributed on the vertical axis (Arrangement). Empty = the Compose default: Top, or Bottom with reverseLayout; an explicit Top with reverseLayout keeps the block at the top. |
| `horizontalAlignment` | Horizontal alignment       | enum   | no       | `Start`, `CenterHorizontally`, `End`                                    | `Start` | How the items are aligned on the horizontal axis (Alignment).                                                                                                                                    |
| `spacing`             | Spacing between items (dp) | number | no       |                                                                         |         | Space between the children in dp (Arrangement.spacedBy). Empty = 0.                                                                                                                              |
| `contentPadding`      | Content padding (dp)       | number | no       |                                                                         |         | Inner padding of the list in dp (PaddingValues). Empty = 0.                                                                                                                                      |
| `reverseLayout`       | Reverse layout             | enum   | no       | `true`, `false`                                                         | `false` | true starts from the end of the list (reverseLayout).                                                                                                                                            |
| `width`               | Width                      | enum   | no       | `wrap`, `fill`, `fixed`                                                 | `fill`  | wrap fits the content, fill takes all the available width and fixed uses the marking's width (dp).                                                                                               |
| `height`              | Height                     | enum   | no       | `wrap`, `fill`, `fixed`                                                 | `fill`  | wrap fits the content, fill takes all the available height and fixed uses the marking's height (dp).                                                                                             |
| `weight`              | Weight                     | number | no       |                                                                         |         | Share of the space left over in a Row or Column (Modifier.weight). Empty = no weight.                                                                                                            |

## Compose

- Symbol: `androidx.compose.foundation.lazy.LazyColumn`
- File (`path`): `compose/foundation/foundation/src/commonMain/kotlin/androidx/compose/foundation/lazy/LazyDsl.kt`

How the annotation becomes the call (the values below are examples; the parameter names and the expressions are those of `params` and `values` in `code`):

```kotlin
LazyColumn(
    verticalArrangement = Arrangement.spacedBy(8.dp),
    contentPadding = PaddingValues(16.dp),
    modifier = Modifier.fillMaxSize(),
) {
    item { /* child 1 */ }
    item { /* child 2 */ }
    // identical, repeated children: items(list) { item -> ... }
}
```

Notes from `code` (what the tool hands to the agent):

> Each child marking becomes an `item { … }` in the `content` (identical, repeated children become `items(list) { … }`). `contentPadding` becomes `PaddingValues(<contentPadding>.dp)` and `spacing` becomes `Arrangement.spacedBy(<spacing>.dp)` in place of `verticalArrangement`. The list needs a bounded height (`fill`, `fixed` or `weight`). Size: `fill` becomes `Modifier.fillMaxWidth()`/`fillMaxHeight()`, `fixed` becomes `Modifier.width(<marking width>.dp)`/`height(<marking height>.dp)` and `weight` becomes `Modifier.weight(<weight>f)` (only inside a Row, Column or FlowRow).

## Examples

- **Screen list**: spacing=8, contentPadding=16, width=fill, height=fill
- **Compact list**: verticalArrangement=Top, width=fill, height=fixed

## Fidelity

Reference: Compose `material3` 1.4.0, commit `5113b82a4ed6416d6344efa50e41db8cb65928ff` (decisions 1 to 3 of the faithful Material 3 stage). 1 dp = 1 component unit; the container's density converts it to image pixels (`docs/COMPONENT-FORMAT.md`, "Units and density"). This type belongs to Foundation, not to Material: it has no tokens file, and the drawing follows the foundation behavior, with the values coming from the fields.

**Files used**

- `compose/foundation/foundation/src/commonMain/kotlin/androidx/compose/foundation/lazy/LazyDsl.kt` (lines 388 to 398: `LazyColumn(contentPadding = PaddingValues(0.dp), reverseLayout = false, verticalArrangement = if (!reverseLayout) Arrangement.Top else Arrangement.Bottom, horizontalAlignment = Alignment.Start)`).
- `compose/foundation/foundation-layout/src/commonMain/kotlin/androidx/compose/foundation/layout/Arrangement.kt` (lines 110 to 290: `Start`, `End`, `Top`, `Bottom`, `Center`, `SpaceEvenly`, `SpaceBetween`, `SpaceAround`; line 296: `spacedBy`).

**How the drawing follows Compose**

- `verticalArrangement` becomes the slot's `justify` (`Top` `start`, `Center` `center`, `Bottom` `end`, `SpaceBetween` `space-between`) and `horizontalAlignment` becomes the `align` (`Start` `start`, `CenterHorizontally` `center`, `End` `end`), through `$switch` (format 4: expression in `layout.justify` and `layout.align`).
- `spacing` is the slot's `gap` and `contentPadding` is its `padding`, like `Arrangement.spacedBy` and `PaddingValues`.
- `reverseLayout` turns on the slot's `layout.reverse`; with the default arrangement (empty field) the block stays at the end of the axis, like the `Arrangement.Bottom` that Compose uses in this combination. With an explicit `Top` the block stays at the top, in reversed order; with an explicit `Bottom`, at the end.
- The slot has `clip: true` (format 4): a child that goes past the component's box is clipped at the edge, like the `clipScrollableContainer` that `scrollingContainer` applies to `LazyColumn` (`ScrollingContainer.kt` line 56; `LazyList.kt` lines 143 to 154). The clipped box is the whole component's, with the `contentPadding` inside it, as in Compose.
- No color, font or radius is drawn; the slot's label shows the configuration summary.

**What still differs from Compose**

- `SpaceAround` and `SpaceEvenly` become `space-around` and `space-evenly` of the `justify`.
- The order of the children is reversed with `reverseLayout` (`layout.reverse`), as in Compose.
- Scrolling, `state`, `flingBehavior` and lazy composition do not exist in a static drawing: whatever goes past the box is clipped and there is no way to scroll to it.
