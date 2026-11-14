# LazyRow

Scrollable horizontal list that composes only what is visible. Use it for simple carousels of cards, chips and thumbnails.

Annotation type: `lazy-row` (Layout layer).

## Fields

| Key                     | Label                      | Type   | Required | Options                                                                | Default | Description                                                                                                                                                                                           |
| ----------------------- | -------------------------- | ------ | -------- | ---------------------------------------------------------------------- | ------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `horizontalArrangement` | Horizontal arrangement     | enum   | no       | `Start`, `End`, `Center`, `SpaceBetween`, `SpaceAround`, `SpaceEvenly` | —       | How the items are distributed on the horizontal axis (Arrangement). Empty = the Compose default: Start, or End with reverseLayout; an explicit Start with reverseLayout keeps the block at the start. |
| `verticalAlignment`     | Vertical alignment         | enum   | no       | `Top`, `CenterVertically`, `Bottom`                                    | `Top`   | How the items are aligned on the vertical axis (Alignment).                                                                                                                                           |
| `spacing`               | Spacing between items (dp) | number | no       |                                                                        |         | Space between the children in dp (Arrangement.spacedBy). Empty = 0.                                                                                                                                   |
| `contentPadding`        | Content padding (dp)       | number | no       |                                                                        |         | Inner padding of the list in dp (PaddingValues). Empty = 0.                                                                                                                                           |
| `reverseLayout`         | Reverse layout             | enum   | no       | `true`, `false`                                                        | `false` | true starts from the end of the list (reverseLayout).                                                                                                                                                 |
| `width`                 | Width                      | enum   | no       | `wrap`, `fill`, `fixed`                                                | `wrap`  | wrap fits the content, fill takes all the available width and fixed uses the marking's width (dp).                                                                                                    |
| `height`                | Height                     | enum   | no       | `wrap`, `fill`, `fixed`                                                | `wrap`  | wrap fits the content, fill takes all the available height and fixed uses the marking's height (dp).                                                                                                  |
| `weight`                | Weight                     | number | no       |                                                                        |         | Share of the space left over in a Row or Column (Modifier.weight). Empty = no weight.                                                                                                                 |

## Compose

- Symbol: `androidx.compose.foundation.lazy.LazyRow`
- File (`path`): `compose/foundation/foundation/src/commonMain/kotlin/androidx/compose/foundation/lazy/LazyDsl.kt`

How the annotation becomes the call (the values below are examples; the parameter names and the expressions are those of `params` and `values` in `code`):

```kotlin
LazyRow(
    horizontalArrangement = Arrangement.spacedBy(8.dp),
    contentPadding = PaddingValues(16.dp),
    verticalAlignment = Alignment.CenterVertically,
    modifier = Modifier.fillMaxWidth(),
) {
    item { /* child 1 */ }
    item { /* child 2 */ }
}
```

Notes from `code` (what the tool hands to the agent):

> Each child marking becomes an `item { … }` in the `content` (identical, repeated children become `items(list) { … }`). `contentPadding` becomes `PaddingValues(<contentPadding>.dp)` and `spacing` becomes `Arrangement.spacedBy(<spacing>.dp)` in place of `horizontalArrangement`. The list needs a bounded width (`fill` or `fixed`). Size: `fill` becomes `Modifier.fillMaxWidth()`/`fillMaxHeight()`, `fixed` becomes `Modifier.width(<marking width>.dp)`/`height(<marking height>.dp)` and `weight` becomes `Modifier.weight(<weight>f)` (only inside a Row, Column or FlowRow).

## Examples

- **Chip carousel**: spacing=8, contentPadding=16, verticalAlignment=CenterVertically, width=fill
- **Card strip**: horizontalArrangement=Start, spacing=12, width=fill, height=fixed

## Fidelity

Reference: Compose `material3` 1.4.0, commit `5113b82a4ed6416d6344efa50e41db8cb65928ff` (decisions 1 to 3 of the faithful Material 3 stage). 1 dp = 1 component unit; the container's density converts it to image pixels (`docs/COMPONENT-FORMAT.md`, "Units and density"). This type belongs to Foundation, not to Material: it has no tokens file, and the drawing follows the foundation behavior, with the values coming from the fields.

**Files used**

- `compose/foundation/foundation/src/commonMain/kotlin/androidx/compose/foundation/lazy/LazyDsl.kt` (lines 328 to 338: `LazyRow(contentPadding = PaddingValues(0.dp), reverseLayout = false, horizontalArrangement = if (!reverseLayout) Arrangement.Start else Arrangement.End, verticalAlignment = Alignment.Top)`).
- `compose/foundation/foundation-layout/src/commonMain/kotlin/androidx/compose/foundation/layout/Arrangement.kt` (lines 110 to 290: `Start`, `End`, `Top`, `Bottom`, `Center`, `SpaceEvenly`, `SpaceBetween`, `SpaceAround`; line 296: `spacedBy`).

**How the drawing follows Compose**

- `horizontalArrangement` becomes the slot's `justify` (`Start` `start`, `Center` `center`, `End` `end`, `SpaceBetween` `space-between`) and `verticalAlignment` becomes the `align` (`Top` `start`, `CenterVertically` `center`, `Bottom` `end`), through `$switch` (format 4: expression in `layout.justify` and `layout.align`).
- `spacing` is the slot's `gap` and `contentPadding` is its `padding`.
- `reverseLayout` turns on the slot's `layout.reverse`; with the default arrangement (empty field) the block stays at the end of the axis, like the `Arrangement.End` that Compose uses in this combination. With an explicit `Start` the block stays at the start, in reversed order; with an explicit `End`, at the end.
- The slot has `clip: true` (format 4): a child that goes past the component's box is clipped at the edge, like the `clipScrollableContainer` that `scrollingContainer` applies to `LazyRow` (`ScrollingContainer.kt` line 56; `LazyList.kt` lines 143 to 154). The clipped box is the whole component's, with the `contentPadding` inside it, as in Compose.
- No color, font or radius is drawn.

**What still differs from Compose**

- `SpaceAround` and `SpaceEvenly` become `space-around` and `space-evenly` of the `justify`.
- The order of the children is reversed with `reverseLayout` (`layout.reverse`), as in Compose.
- Scrolling, `state` and `flingBehavior` do not exist in a static drawing: whatever goes past the box is clipped and there is no way to scroll to it.
