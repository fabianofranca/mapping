# Carousel

Horizontal carousel of items with an image and a label. Multi-browse shows one large item with smaller neighbors, uncontained keeps fixed-width items and centered-hero centers one large item.

Annotation type: `carousel` (Components layer).

## Fields

| Key                  | Label                     | Type   | Required | Options                                        | Default        | Description                                                                                                                                                                                                                                   |
| -------------------- | ------------------------- | ------ | -------- | ---------------------------------------------- | -------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `items`              | Items                     | table  | yes      | see Columns below                              |                | One carousel item per row, in the order they appear.                                                                                                                                                                                          |
| `style`              | Style                     | enum   | no       | `multi-browse`, `uncontained`, `centered-hero` | `multi-browse` | multi-browse (HorizontalMultiBrowseCarousel), uncontained (HorizontalUncontainedCarousel) or centered-hero (HorizontalCenteredHeroCarousel).                                                                                                  |
| `preferredItemWidth` | Preferred item width (dp) | number | no       |                                                |                | Only on multi-browse (required in Compose): the width that the large items want to have; the carousel chooses how many large ones fit and adjusts their size, and that of the medium and the small one (from 40 to 56), to the marking width. |
| `itemWidth`          | Item width (dp)           | number | no       |                                                |                | Only on uncontained (required in Compose): the fixed width of each item.                                                                                                                                                                      |
| `itemSpacing`        | Item spacing (dp)         | number | no       |                                                |                | Space between the items in dp (itemSpacing). Empty = 0 in the code; the drawing uses 8. On centered-hero the inset and the width of the items depend on it.                                                                                   |
| `width`              | Width                     | enum   | no       | `wrap`, `fill`, `fixed`                        | `wrap`         | wrap fits the content, fill takes all the available width and fixed uses the marking width (dp).                                                                                                                                              |
| `height`             | Height                    | enum   | no       | `wrap`, `fill`, `fixed`                        | `wrap`         | wrap fits the content, fill takes all the available height and fixed uses the marking height (dp).                                                                                                                                            |
| `weight`             | Weight                    | number | no       |                                                |                | Share of the leftover space in a Row or Column (Modifier.weight). Empty = no weight.                                                                                                                                                          |

Columns of `items` (one row per item):

| Key     | Label       | Type   | Required | Options | Default |
| ------- | ----------- | ------ | -------- | ------- | ------- |
| `image` | Image (URL) | string | yes      |         |         |
| `label` | Label       | string | no       |         |         |

## Compose

- Symbol: `androidx.compose.material3.carousel.HorizontalMultiBrowseCarousel`
- File (`path`): `compose/material3/material3/src/commonMain/kotlin/androidx/compose/material3/carousel/Carousel.kt`
- The `style` field chooses the symbol; values without their own case use the base one.

| `style`               | Symbol                           |
| --------------------- | -------------------------------- |
| `multi-browse` (base) | `HorizontalMultiBrowseCarousel`  |
| `uncontained`         | `HorizontalUncontainedCarousel`  |
| `centered-hero`       | `HorizontalCenteredHeroCarousel` |

All three require `@OptIn(ExperimentalMaterial3Api::class)` in the pinned commit (`CarouselState` and `CarouselItemScope` are also experimental).

How the annotation becomes the call (the values below are examples; the parameter names and expressions are those of `params` and `values` in the `code`):

```kotlin
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun Destinations(items: List<Destination>) {
    HorizontalMultiBrowseCarousel(    // style uncontained: HorizontalUncontainedCarousel(itemWidth = …), centered-hero: HorizontalCenteredHeroCarousel
        state = rememberCarouselState { items.size },    // one entry per row of items
        preferredItemWidth = 186.dp,                     // preferredItemWidth
        itemSpacing = 8.dp,                              // itemSpacing
        modifier = Modifier.fillMaxWidth().height(205.dp),
    ) { index ->
        val item = items[index]
        Box {
            AsyncImage(    // remote image: app loader (Coil), outside androidx
                model = item.image,                      // image column
                contentDescription = item.label,
                contentScale = ContentScale.Crop,
                modifier = Modifier.height(205.dp).maskClip(MaterialTheme.shapes.extraLarge),
            )
            Text(item.label)                             // label column, only if filled in
        }
    }
}
```

Notes from the `code` (what the tool hands to the agent):

> Requires @OptIn(ExperimentalMaterial3Api::class) (all three carousels, `CarouselState` and `CarouselItemScope` are experimental in the pinned commit). `state = rememberCarouselState { <number of rows of items> }` (the `itemCount` is the trailing lambda) and `content = { index -> … }` draws the item `items[index]`, inside the `CarouselItemScope`: a remote image with the app's loader (for example Coil `AsyncImage(model = <image>, contentDescription = <label>, contentScale = ContentScale.Crop, modifier = Modifier.height(205.dp).maskClip(MaterialTheme.shapes.extraLarge))`, outside androidx); `maskClip` belongs to the item scope and gives the clip that follows the scroll; a filled-in `label` becomes a `Text(<label>)` over the image, in a `Box`. The item width is a required parameter depending on the style: `preferredItemWidth = <preferredItemWidth>.dp` on multi-browse and `itemWidth = <itemWidth>.dp` on uncontained; centered-hero takes no width (the optional `maxItemWidth` is not mapped). `itemSpacing` becomes `<itemSpacing>.dp`. The height comes from the item (`Modifier.height(…)`), not from the carousel. Size: `fill` becomes `Modifier.fillMaxWidth()`/`fillMaxHeight()`, `fixed` becomes `Modifier.width(<marking width>.dp)`/`height(<marking height>.dp)` and `weight` becomes `Modifier.weight(<weight>f)` (only inside Row, Column or FlowRow).

## Drawing

The component draws the carousel as Compose shows it at the start of the scroll, from the marking width (`$size`), the index and the number of table items (`$rows`), with corners of 28 and the label over a scrim veil; the excess is cut by the box. Each style follows its keyline strategy:

- **multi-browse**: large items, one medium and one small, from the edge (`Keylines.kt`, `multiBrowseKeylineList`). The large ones have the `preferredItemWidth` when the arrangement fits and adjust when it does not; the small one stays between 40 and 56 and the medium between 90% and 110% of the average of large and small. At 360 wide, with 186 preferred and spacing 8: large 186, medium 118 and small 40. Items that go past the edge are not drawn.
- **uncontained**: items of the `itemWidth` size, from the edge, with the `itemSpacing` between them. The drawing does not let anything go past the box: the item that crosses the right edge gets only the width that remains (at 360, the third one of 140 measures 56) and what would remain with less than 32 is not drawn.
- **centered-hero**: one large item that takes what remains between two small items (`width − 2 × small − 2 × itemSpacing`), with the small one of 40, the Compose minimum (264 at 360 with spacing 8), and the first item after the space of the missing small one (`small + itemSpacing`, 48). The items have the width of the large one and the next one shows only in the part that fits in the box (40 at 360); those that would fall beyond the box, or with less than 32 of visible width, are not drawn. With fewer than 3 items Compose aligns to the start, with no inset, with a single small one (`width − itemSpacing − 40`).

Everything changes with the marking width: the same annotation shows more large items in a wide marking and only one in a narrow one. The Fidelity section says what each value follows and what the drawing approximates.

## Examples

- **Multi-browse**: style=multi-browse, preferredItemWidth=186, itemSpacing=8, width=fill, height=fixed
- **Uncontained**: style=uncontained, itemWidth=140, itemSpacing=12, width=fill, height=fixed
- **Centered hero**: style=centered-hero, itemSpacing=8, width=fill, height=fixed

## Fidelity

Reference: Compose `material3` 1.4.0, commit `5113b82a4ed6416d6344efa50e41db8cb65928ff` (decisions 1 to 3 of the faithful Material 3 stage). 1 dp = 1 component unit; the container density converts to image pixels (`docs/COMPONENT-FORMAT.md`, "Units and density"). The values come from the specialization tokens (`tokens`, in the `light` and `dark` modes), which mirror the androidx token files; no color, font, radius or color opacity is literal in the component and no text node declares `family` (all inherit `font-sans`). The item radius is the `corner-extra-large` shape, the `MaterialTheme.shapes.extraLarge` that the `code` example passes to `maskClip`. `Carousel.kt` defines no color, shape or typography: the item (image and label) belongs to the app, and the drawing uses the Material tokens to illustrate it.

**Files used**

- `compose/material3/material3/src/commonMain/kotlin/androidx/compose/material3/carousel/Carousel.kt` (lines 109 to 150: `HorizontalMultiBrowseCarousel`, `preferredItemWidth`, `itemSpacing` and the `itemCount` that reaches the strategy; 209 to 245: `HorizontalUncontainedCarousel`, `itemWidth`; 293 to 335: `HorizontalCenteredHeroCarousel`, with `maxItemWidth` unspecified; 363 to 475: `Carousel`, the pager with `pageSpacing = itemSpacing`; 518 to 535: `calculateMainAxisPageSize`, which builds the `Strategy` with the available width; 568 to 700: `carouselItem`, the item that receives `mainAxisSize` from the strategy and the clip (`clipShape`) from `maskClip`; 857 to 863: `MinSmallItemSize` 40, `MaxSmallItemSize` 56, `AnchorSize` 10 and `MediumLargeItemDiffThreshold` 0.85).
- `compose/material3/material3/src/commonMain/kotlin/androidx/compose/material3/carousel/Keylines.kt` (lines 46 to 143: `multiBrowseKeylineList`, with the large and small targets, the candidate counts and the removal of the small one when there are fewer items than positions; 161 to 200: `uncontainedKeylineList`; 215 to 289: `heroKeylineList`, `shouldCenter` and the arrangement; 291 to 322: `createLeftAlignedKeylineList` and `createCenterAlignedKeylineList`).
- `compose/material3/material3/src/commonMain/kotlin/androidx/compose/material3/carousel/Arrangement.kt` (lines 98 to 145: `findLowestCostArrangement`, the priority order and the cost; 172 to 253: `fit`, the small one adjusted between the minimum and the maximum, the large ones with what remains and the medium with 10% slack (`MediumItemFlexPercentage`, line 71); 265 to 276: `calculateLargeSize`).
- `carousel/Strategy.kt` (lines 144 to 219: `getKeylineListForScrollOffset`; 318 to 412: `getStartKeylineSteps`, which snaps the large item to the start when the scroll is at the beginning) and `carousel/CarouselItemScope.kt` (lines 51 to 95: `maskClip` with the given shape).
- `compose/material3/material3/src/commonMain/kotlin/androidx/compose/material3/tokens/ShapeTokens.kt` (line 29: `CornerExtraLarge` 28), `tokens/ScrimTokens.kt` (line 22: `Scrim`) and `tokens/TypeScaleTokens.kt` (`LabelLarge` 14/20/500/0.1).

**How the drawing follows Compose**

- Items with `corner-extra-large` (28) clipped (`clip`), with the image placeholder in `surface-container-highest` (the background color while the image does not load or when the URL is empty).
- Multi-browse (`Keylines.kt`, 46 to 143, and `Arrangement.kt`): the large target is `min(preferredItemWidth, width)` (line 62), the small one is a third of it clamped between 40 and 56 (line 67) and the medium one the average of the two. Compose tries the counts of large items from `ceil(width / target)` to `floor((width − medium − 56) / target)`, with and without a medium, and keeps the lowest-cost arrangement, which is `|target − large| × priority` (`Arrangement.kt`, lines 56 to 63 and 98 to 145). Inside each arrangement (`fit`, 172 to 253) the small one shrinks or grows between 40 and 56, the large one takes what remains and the medium one flexes up to 10% to return the large one to the target. The drawing does the same calculations: the number of large ones and the presence of the medium come from the remainder of `width / (target + itemSpacing)`, the small one is `clamp(remainder − itemSpacing − starting medium, 40, 56)`, the medium is the leftover clamped to 90% and 110% of `(starting large + small) / 2` and the large ones divide what remains (`fill`). Hence the large one has exactly the target in the width ranges where Compose keeps it (at 360 with 186 preferred the first item has **186**, the same 186 as before, with the medium of 118 and the small of 40; at 430 to 440, two large ones of 186) and changes size only between them. The space between items comes from `itemSpacing` (default 8; empty = 0 in the code).
- Fewer items than arrangement positions (`Keylines.kt`, 102 to 131): Compose removes the small one and redoes the arrangement; the drawing redoes it too (at 600 wide with the 3 items of the example there are three items of 167.31, and not the two of 190 and the medium of 139 of the full arrangement). Items that the arrangement has no position to show are not drawn.
- `preferredItemWidth` larger than the marking: the target is the width itself (line 62) and there is one large item of `width − itemSpacing − 40` with the small one of 40; with a single item, it takes the whole width.
- Uncontained: items of the `itemWidth` size (default 140), from the edge, with `itemSpacing` between them (`uncontainedKeylineList`, 161 to 200).
- Centered-hero (`Keylines.kt`, 215 to 289, and `Arrangement.kt`, 198 to 206): without `maxItemWidth` the large target is the whole width (line 235) and the small one is a third of it clamped between `MinSmallItemSize` 40 and `MaxSmallItemSize` 56 (`targetSmallSize`, line 237); since the large one does not fit in the target, `fit` shrinks the small ones to the minimum of 40, and the large one gets `width − 2 × 40 − 2 × itemSpacing` (264 at 360 with spacing 8; 248 with spacing 16; 480 − 80 − 16 = 384 at 480). The first item starts after the space of the missing small one (`40 + itemSpacing`, 48 at 360), which is where `createCenterAlignedKeylineList` puts it (291 to 322); the items all have the width of the large one. With fewer than 3 items (`shouldCenter`, line 230) the arrangement has a single small one and is aligned to the start: the large one has `width − itemSpacing − 40` and there is no inset. In a marking narrower than 130 (90 with fewer than 3 items: `fullscreenThreshold`, `40 × small + 50`, lines 241 to 244) only the large one fits.
- Optional label over the item, in `label-large` on one line with `…` (`maxLines` 1 and `ellipsis`), 16 from the edges and 14 from the bottom, in `secondary-fixed` (the same color in both modes, because the label sits over an image); under it a 48 scrim: a gradient from bottom to top, from `scrim` with `alpha` 0.55 (solid in the bottom 36 px, where the label line is) to `scrim` with `alpha` 0 at the top. The 0.55 is the library's choice, not Compose's: it ensures a contrast of at least 4.5:1 of the label over the image placeholder (the app, the Catalog and the MCP PNG never load the remote image). On the small items the label comes out cut by the item's clip, as `maskClip` cuts the app's content in Compose.
- Single-line label centered by the capital letter (`cap-middle`): the `label` node, anchored 14 from the item's bottom, uses `font.verticalAlign: "cap-middle"` and stays `hug` in height, because the parent also measures by the text; the text box is the line, centered in the parent. Compose's `Text` centers by the font's line box (ascent and descent); the drawing centers the capital height in the box, and with Roboto the two coincide to within 1 px.

**What still differs from Compose**

- **The threshold between two arrangements is approximate.** Compose chooses the arrangement by the cost of each candidate; the format has no variable to store the cost of each one and compare them, so the drawing decides the number of large ones and the presence of the medium by linear thresholds of `preferredItemWidth` and `itemSpacing`, adjusted against the algorithm. Far from the switches the drawing matches Compose to within 0.5 px; within a few px (about 3) of the width where Compose switches arrangement (for example, from one large with the medium to two large ones), the drawing may already have switched or not yet. On a grid of widths from 200 to 900, `preferredItemWidth` of 150, 186 and 240, `itemSpacing` of 0, 8 and 16 and 1, 3 or 12 items, and not counting the neighborhood of the switches, the drawing matches Compose to within 0.5 px in about 97% of the cases.
- **The tight arrangement of the first period is not reproduced.** With the width slightly above the target (for example 278 to 291 wide with 186 preferred) Compose may choose `ceil(width / target)` shrunken large ones (two items of 80, a medium of 53 and a small of 40, because priority 1 weighs more than the cost of two much larger large ones); the drawing keeps a single large one (with the small one or with the medium and the small one). It is part of the 3% of the grid above where the drawing differs.
- **Scrolling does not exist.** The drawing is the state at the start of the scroll, without the shrinking and growing of the items (`carouselItem`, 568 to 700) or the fling. On centered-hero Compose, at scroll 0, snaps the large item to the start of the box (`Strategy.kt`, 318 to 412) and only centers the large one from the first step; the drawing shows the centered state, with the inset (what `createCenterAlignedKeylineList` describes), because that is what gives the style its name.
- Uncontained: Compose shows the item that goes past the edge as a mask of 1.5 times what remains (`calculateMediumChildSize`, `Keylines.kt` 335 to 359); the drawing shows it at full width, cut by the box.
- `maxItemWidth` (the hero with more than one large item), `contentPadding` (`horizontal` and `vertical`), `minSmallItemWidth` and `maxSmallItemWidth` are fields and code, but the drawing does not use them (it uses the default 40 and 56); no remote image: the drawing shows the placeholder until the app's loader (Coil) delivers the image, like the `image` node.
- The scrim is a gradient from dark (`scrim` with `alpha` 0.55, solid in the bottom 36 px) to transparent (`scrim` with `alpha` 0) at the top. The label color, the scrim and the one-line limit belong to the app in Compose (`Text` over the image); the drawing chooses them to illustrate.
