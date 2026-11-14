# HorizontalPager

Pages that alternate with a horizontal swipe. Use it for onboarding, one-image-at-a-time galleries and swipeable tabs.

Annotation type: `horizontal-pager` (Layout layer).

## Fields

| Key                 | Label                | Type   | Required | Options                             | Default            | Description                                                                                        |
| ------------------- | -------------------- | ------ | -------- | ----------------------------------- | ------------------ | -------------------------------------------------------------------------------------------------- |
| `contentPadding`    | Content padding (dp) | number | no       |                                     |                    | Inner padding of the pager in dp (PaddingValues). Empty = 0.                                       |
| `pageSpacing`       | Page spacing (dp)    | number | no       |                                     |                    | Space between the pages in dp (pageSpacing). Empty = 0.                                            |
| `verticalAlignment` | Vertical alignment   | enum   | no       | `Top`, `CenterVertically`, `Bottom` | `CenterVertically` | How each page aligns on the vertical axis (Alignment).                                             |
| `userScrollEnabled` | User scroll          | enum   | no       | `true`, `false`                     | `true`             | false locks the swipe (the page only changes by code).                                             |
| `reverseLayout`     | Reverse layout       | enum   | no       | `true`, `false`                     | `false`            | true starts from the last page.                                                                    |
| `width`             | Width                | enum   | no       | `wrap`, `fill`, `fixed`             | `wrap`             | wrap fits the content, fill takes all the available width and fixed uses the marking width (dp).   |
| `height`            | Height               | enum   | no       | `wrap`, `fill`, `fixed`             | `wrap`             | wrap fits the content, fill takes all the available height and fixed uses the marking height (dp). |
| `weight`            | Weight               | number | no       |                                     |                    | Share of the leftover space in a Row or Column (Modifier.weight). Empty = no weight.               |

## Compose

- Symbol: `androidx.compose.foundation.pager.HorizontalPager`
- File (`path`): `compose/foundation/foundation/src/commonMain/kotlin/androidx/compose/foundation/pager/Pager.kt`

How the annotation becomes the call (the values below are examples; the parameter names and expressions are those of `params` and `values` in `code`):

```kotlin
val pagerState = rememberPagerState(pageCount = { 3 }) // number of children

HorizontalPager(
    state = pagerState,
    verticalAlignment = Alignment.CenterVertically,
    modifier = Modifier.fillMaxSize(),
) { page ->
    when (page) {
        0 -> { /* child 1 */ }
        1 -> { /* child 2 */ }
        else -> { /* child 3 */ }
    }
}
```

Notes from `code` (what the tool hands to the agent):

> Each child marking is a page: create `val pagerState = rememberPagerState(pageCount = { <number of children> })`, pass `state = pagerState` and pick the child by index in `pageContent = { page -> … }`. `contentPadding` becomes `PaddingValues(<contentPadding>.dp)` and `pageSpacing` becomes `pageSpacing = <pageSpacing>.dp`. Size: `fill` becomes `Modifier.fillMaxWidth()`/`fillMaxHeight()`, `fixed` becomes `Modifier.width(<marking width>.dp)`/`height(<marking height>.dp)` and `weight` becomes `Modifier.weight(<weight>f)` (only inside a Row, Column or FlowRow).

## Examples

- **Onboarding pages**: verticalAlignment=CenterVertically, width=fill, height=fill
- **Peeking pages**: contentPadding=32, pageSpacing=16, width=fill, height=fixed

## Fidelity

Reference: Compose `material3` 1.4.0, commit `5113b82a4ed6416d6344efa50e41db8cb65928ff` (decisions 1 to 3 of the faithful Material 3 stage). 1 dp = 1 component unit; the container density converts it to image pixels (`docs/COMPONENT-FORMAT.md`, "Units and density"). This type is from Foundation, not Material: it has no token file, and the drawing follows the foundation behavior, with the values coming from the fields.

**Files used**

- `compose/foundation/foundation/src/commonMain/kotlin/androidx/compose/foundation/pager/Pager.kt` (lines 113 to 125: `HorizontalPager(contentPadding = PaddingValues(0.dp), pageSpacing = 0.dp, verticalAlignment = Alignment.CenterVertically, userScrollEnabled = true, reverseLayout = false)`).

**How the drawing follows Compose**

- `verticalAlignment` becomes the slot's `align` (`Top` `start`, `CenterVertically` `center`, `Bottom` `end`), by `$switch` (format 4: expression in `layout.align`); the default is `center`, as in Compose.
- `pageSpacing` is the slot's `gap` and `contentPadding` is its `padding`; the slot is a `row`.
- No color, font or radius is drawn.

**What still differs from Compose**

- `userScrollEnabled`, `pageSize` and the page state do not exist in a static drawing; the pages appear side by side, in the marking order, and `reverseLayout` puts them in reverse order starting from the end (`layout.reverse`).
