# PullToRefreshBox

Area that refreshes the content when pulled down, with the circular indicator at the top. The child markings are the content, which must scroll.

Annotation type: `pull-to-refresh` (Components layer).

## Fields

| Key                | Label             | Type   | Required | Options                                                                                                             | Default    | Description                                                                                                                       |
| ------------------ | ----------------- | ------ | -------- | ------------------------------------------------------------------------------------------------------------------- | ---------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `isRefreshing`     | Refreshing        | enum   | no       | `true`, `false`                                                                                                     | `false`    | true shows the spinner (refresh in progress, isRefreshing = true); false shows the indicator while being dragged, with the arrow. |
| `contentAlignment` | Content alignment | enum   | no       | `TopStart`, `TopCenter`, `TopEnd`, `CenterStart`, `Center`, `CenterEnd`, `BottomStart`, `BottomCenter`, `BottomEnd` | `TopStart` | Where the content sits inside the Box (Alignment).                                                                                |
| `width`            | Width             | enum   | no       | `wrap`, `fill`, `fixed`                                                                                             | `wrap`     | wrap fits the content, fill takes all the available width and fixed uses the marking's width (dp).                                |
| `height`           | Height            | enum   | no       | `wrap`, `fill`, `fixed`                                                                                             | `wrap`     | wrap fits the content, fill takes all the available height and fixed uses the marking's height (dp).                              |
| `weight`           | Weight            | number | no       |                                                                                                                     |            | Share of the space left over in a Row or Column (Modifier.weight). Empty = no weight.                                             |

## Compose

- Symbol: `androidx.compose.material3.pulltorefresh.PullToRefreshBox`
- File (`path`): `compose/material3/material3/src/commonMain/kotlin/androidx/compose/material3/pulltorefresh/PullToRefresh.kt`
- Stable at the pinned commit, no opt-in.

How the annotation becomes the call (the values below are examples; the parameter names and the expressions are those of `params` and `values` in `code`):

```kotlin
var isRefreshing by remember { mutableStateOf(false) }    // isRefreshing

PullToRefreshBox(
    isRefreshing = isRefreshing,
    onRefresh = { /* starts the refresh and sets isRefreshing to true; when done, back to false */ },
    contentAlignment = Alignment.TopStart,                // contentAlignment
    modifier = Modifier.fillMaxSize(),
) {
    LazyColumn(Modifier.fillMaxSize()) {    // the content must scroll: the child markings
        items(list) { /* item */ }
    }
}
```

Notes from `code` (what the tool hands to the agent):

> Stable, no opt-in. `isRefreshing` binds to a screen state (`var isRefreshing by remember { mutableStateOf(false) }`) and `onRefresh = { /* starts the refresh and sets isRefreshing to true; when done, back to false */ }`. The child markings form the `content` (a `BoxScope`) and must scroll (`LazyColumn` or `Modifier.verticalScroll`), because the gesture comes from nested scrolling. The `indicator` and the `state` (`rememberPullToRefreshState()`) stay at the defaults: the 40 dp circular indicator at the top. `contentAlignment` is the Box's own. Size: `fill` becomes `Modifier.fillMaxWidth()`/`fillMaxHeight()`, `fixed` becomes `Modifier.width(<marking width>.dp)`/`height(<marking height>.dp)` and `weight` becomes `Modifier.weight(<weight>f)` (only inside a Row, Column or FlowRow).

## Drawing

The indicator is the Material 3 default: a 40 circle in surface container high with a shadow and a 16 ring in on surface variant, 40 from the top (the threshold of 80 minus the indicator size) in both states. With `isRefreshing` true it shows the spinner; with false, the threshold frame with the arc and the arrow, which in Compose only exists while the person pulls (at rest the indicator is hidden). The arc and the arrow of the drag are drawn in the canonical orientation and rotated by `rotation`, with Compose's angles written as calculations in the component; the "refreshing" spinner is a frozen frame, with no spin.

## Examples

- **Refreshing**: isRefreshing=true, width=fill, height=fill
- **Resting**: isRefreshing=false, width=fill, height=fill

## Fidelity

Reference: Compose `material3` 1.4.0, commit `5113b82a4ed6416d6344efa50e41db8cb65928ff` (decisions 1 to 3 of the faithful Material 3 stage). 1 dp = 1 component unit; the container's density converts it to image pixels (`docs/COMPONENT-FORMAT.md`, "Units and density"). The values come from the specialization's tokens (`tokens`, in the `light` and `dark` modes), which mirror the androidx tokens files; no color, font, radius or color opacity is left literal in the component and no text node declares `family` (all inherit `font-sans`). The indicator is the `PullToRefreshBox`'s default `Indicator`; the arrow, the spinner and the circle do not use an icon from the set (they are Compose's own drawings).

**Files used**

- `compose/material3/material3/src/commonMain/kotlin/androidx/compose/material3/pulltorefresh/PullToRefresh.kt` (lines 120 to 142: `PullToRefreshBox`, the `Box` with the content and the indicator in `Alignment.TopCenter`; 393 to 430: `PullToRefreshDefaults`, `indicatorShape` `CircleShape`, `indicatorContainerColor` `surfaceContainerHigh`, `indicatorColor` `onSurfaceVariant`, `PositionalThreshold` 80 and `Elevation` `Level2`; 448 to 496: `IndicatorBox`, the `size(SpinnerContainerSize)`, the `translationY = distanceFraction * maxDistance - size.height` (481 to 484) and the shadow only when `distanceFraction > 0` or `isRefreshing`; 509 to 541: `Indicator`, the `CircularProgressIndicator` of `StrokeWidth` and `SpinnerSize` while refreshing and the `CircularArrowProgressIndicator` while pulling; 632 to 661: the arrow and the arc; 663 to 681: `drawCircularIndicator`; 690 to 708: `ArrowValues`; 710 to 732: `drawArrow`; 734 to 746: `MaxProgressArc` 0.8, `StrokeWidth` 2.5, `ArcRadius` 5.5, `SpinnerSize` 16, `SpinnerContainerSize` 40, `ArrowWidth` 10, `ArrowHeight` 5, `MinAlpha` 0.3 and `MaxAlpha` 1).
- `compose/material3/material3/src/commonMain/kotlin/androidx/compose/material3/ProgressIndicator.kt` (the indeterminate `CircularProgressIndicator`, with `StrokeCap.Round` and the 0.1 to 0.87 range of a turn; see `docs/progress-indicator.md`), `tokens/ElevationTokens.kt` (`Level2` 3 dp) and `tokens/ShapeTokens.kt` (`CornerFull`, `CircleShape`).

**How the drawing follows Compose**

- Indicator of 40 in `corner-full` (`CircleShape`), in `surface-container-high` with the two level 2 shadows (point: `y` 1, `blur` 2; ambient: `y` 2, `blur` 6, `spread` 2; tokens `elevation-2-point-*` and `elevation-2-ambient-*`), centered at the top. Compose puts it at `distanceFraction * 80 - 40`, so with the fraction at 1 (the threshold, which is also the point where it stays while refreshing) the top is at 40: that is where the drawing puts it in both states.
- Refreshing (`isRefreshing` true): spinner of 16 (`SpinnerSize`) with a 2.5 stroke and round cap in `on-surface-variant`; radius of the stroke's center 6.75 and the frozen frame of the indeterminate, an arc from 12 o'clock to (0.1 + 0.87) / 2 of a turn, as in `progress-indicator`.
- Pulling (`isRefreshing` false): the frame of `progress` = 1, the instant the threshold is reached (`targetAlpha` 1). `ArrowValues(1)` (`PullToRefresh.kt` 690 to 708) gives `adjustedPercent` 1, `endTrim` 0.8 (`MaxProgressArc`, 734), `rotation` = (−0.25 + 0.4 × 1 + 0) × 0.5 = 0.075 (702), `startAngle` = `rotation` × 360 = 27° (703) and `endAngle` = (`rotation` + `endTrim`) × 360 = 315° (704). The two pieces are `path`s in the canonical orientation, in a 24 box with the 16 circle in the middle, and the angle comes from `rotation` by expression (in degrees, clockwise, around the center of the box, which is the center of the indicator), with no hand-rotated coordinates:
  - The arc (`drawCircularIndicator`, 663 to 681; `drawArc` from `startAngle` with sweep `endAngle − startAngle`, straight cap `StrokeCap.Butt`): the `d` is the 288° arc that starts at 3 o'clock (the 0° of `drawArc`) at radius 6.75, and the node carries `rotation` = `startAngle` + the `rotation` of `ArrowValues` (the `rotate(degrees = values.rotation)` of 654) = 27.075°, written as `(rotation × 360) + rotation` with `rotation` = `(−0.25 + 0.4) × 0.5`.
  - The open arrow of 10 by 5 (`ArrowWidth`, `ArrowHeight`, 741 and 742) with a 2.5 stroke and pointed corner (default `Stroke`; `drawArrow`, 710 to 732): the `d` is the drawing of `moveTo(0, 0)`, `lineTo(5, 5)`, `lineTo(10, 0)` (719 to 722) moved to (radius + center − `inset`, center − `strokeWidth`) (724 to 728), that is, `M13.75 9.5L18.75 14.5L23.75 9.5`, and the node carries `rotation` = `endAngle − strokeWidth` (729) plus the `rotation` of `ArrowValues` (654) = 312.575°, written as `((rotation + 0.8) × 360) − 2.5 + rotation`.
- Background of the area in `surface`; the child markings form the content (the `slot`).

**What still differs from Compose**

- The drag state is a single frame (`progress` = 1): Compose scales the arrow (`scale`) and changes the opacity from 0.3 to 1 as the finger goes down, and the indicator moves up and down with the fraction. Before, the drawing showed the indicator at 8 from the top with a small arrow; now the frame is the threshold's, at 40.
- In `ArrowValues` the `rotation` (0.075 of a turn) is passed as degrees to `rotate(degrees = values.rotation)` (654); the drawing does the same and adds that 0.075° to both angles (the difference from the earlier 27° and 312.5° is 0.01 px).
- The "refreshing" spinner carries no `rotation`: its `d` already starts at 12 o'clock and the canonical arc (from 3 o'clock, with a `rotation` of −90°) would have the same number of coordinates, without saving any calculation.
- The spinner is the frozen frame of the animation (it does not spin), and the arc does not carry the adjustment that Compose makes on the round caps of the indeterminate.
- The `IndicatorBox` clip above the top (`clipRect(top = 0)`) and the shadow that only appears with a fraction greater than 0 do not exist in the static drawing.
- `contentAlignment` and the `weight` do not change the drawing (the content is a `slot`), and the `state`, the `indicator` and the `onRefresh` belong to the code.
