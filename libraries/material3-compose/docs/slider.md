# Slider

Picks a value (single) or a range (range) by sliding the handle along a track, with values from 0 to 1.

Annotation type: `slider` (layer Components).

## Fields

| Key           | Label       | Type   | Required | Options                                 | Default  | Description                                                                                                                                                                                                                                                                                                                                    |
| ------------- | ----------- | ------ | -------- | --------------------------------------- | -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `type`        | Type        | enum   | no       | `single`, `range`                       | `single` | single (Slider) picks one value; range (RangeSlider) picks a range with two handles.                                                                                                                                                                                                                                                           |
| `value`       | Value       | number | no       |                                         | `0.5`    | Handle position in the single type, from 0 to 1 (valueRange 0f..1f); with steps, the handle goes to the nearest step. Ignored in range.                                                                                                                                                                                                        |
| `valueStart`  | Range start | number | no       |                                         | `0.2`    | Range start in the range type, from 0 to 1; with steps, it goes to the nearest step. Ignored in single.                                                                                                                                                                                                                                        |
| `valueEnd`    | Range end   | number | no       |                                         | `0.8`    | Range end in the range type, from 0 to 1, greater than or equal to the start; with steps, it goes to the nearest step. Ignored in single.                                                                                                                                                                                                      |
| `steps`       | Steps       | number | no       |                                         |          | Number of intermediate points between the ends (Slider.steps). Empty, 0 or less than 1 = continuous. With steps, the value goes to the nearest step and the drawing shows exactly steps ticks, plus the two ends.                                                                                                                              |
| `enabled`     | Enabled     | enum   | no       | `true`, `false`                         | `true`   | false disables the slider.                                                                                                                                                                                                                                                                                                                     |
| `interaction` | Interaction | enum   | no       | `none`, `hovered`, `focused`, `pressed` | `none`   | Resting appearance of the interaction state: focused or pressed narrow the handle from 4 to 2; hovered keeps the width of 4 and does not change the drawing; none = no state. It only changes the drawing and does not go into the code. With enabled false nothing is drawn (the disabled state wins). In range it applies to the end handle. |
| `width`       | Width       | enum   | no       | `wrap`, `fill`, `fixed`                 | `fill`   | fill takes all the available width, wrap uses the Compose minimum width and fixed uses the marking width (dp).                                                                                                                                                                                                                                 |
| `weight`      | Weight      | number | no       |                                         |          | Share of the leftover space in a Row or Column (Modifier.weight). Empty = no weight.                                                                                                                                                                                                                                                           |

## Compose

- Symbol: `androidx.compose.material3.Slider`
- File (`path`): `compose/material3/material3/src/commonMain/kotlin/androidx/compose/material3/Slider.kt`
- The `type` field chooses the symbol; values without their own case use the base one.

| `type`          | Symbol        |
| --------------- | ------------- |
| `single` (base) | `Slider`      |
| `range`         | `RangeSlider` |

How the annotation becomes the call (the values below are examples; the parameter names and expressions are those of `params` and `values` in `code`):

```kotlin
var value by remember { mutableFloatStateOf(0.5f) }
Slider(    // type range: RangeSlider(value = 0.2f..0.8f, onValueChange = { range -> … })
    value = value,
    onValueChange = { value = it },
    valueRange = 0f..1f,
    steps = 4,    // only with steps filled
    enabled = true,
    modifier = Modifier.fillMaxWidth(),    // width = fill
)
```

`code` notes (what the tool hands to the agent):

> `Slider(value = <value>f, onValueChange = { … })`: `value` and `onValueChange` bind to a screen state, `valueRange` stays at the default `0f..1f` and `steps` is only included when filled and greater than 0; `onValueChangeFinished` is optional. Use the stable overload `(value, onValueChange, modifier, enabled, valueRange, steps, onValueChangeFinished, colors, interactionSource)`: the ones that take `SliderState` or the `thumb` and `track` slots require `@OptIn(ExperimentalMaterial3Api::class)` and are not the ones recommended here. Size: `fill` becomes `Modifier.fillMaxWidth()`, `fixed` becomes `Modifier.width(<marking width>.dp)` and `weight` becomes `Modifier.weight(<weight>f)` (only inside Row, Column or FlowRow).

`range` variant: `RangeSlider(value = <valueStart>f..<valueEnd>f, onValueChange = { range -> … })`: the value is a `ClosedFloatingPointRange<Float>` (`range.start`, `range.endInclusive`) bound to a screen state, with `valueRange = 0f..1f`. Use the stable overload `(value, onValueChange, …, steps, onValueChangeFinished, colors)`; the one that takes `RangeSliderState` requires `@OptIn(ExperimentalMaterial3Api::class)` and is not the one recommended here. Size: `fill` becomes `Modifier.fillMaxWidth()`, `fixed` becomes `Modifier.width(<marking width>.dp)` and `weight` becomes `Modifier.weight(<weight>f)` (only inside Row, Column or FlowRow).

## Examples

- **Single value**: type=single, value=0.5
- **With steps**: type=single, value=0.4, steps=4
- **Snap to step**: type=single, value=0.37, steps=4
- **Range**: type=range, valueStart=0.2, valueEnd=0.8
- **Hovered**: type=single, value=0.5, interaction=hovered
- **Focused**: type=single, value=0.4, steps=4, interaction=focused
- **Pressed**: type=range, valueStart=0.2, valueEnd=0.8, interaction=pressed

## Fidelity

Reference: Compose `material3` 1.4.0, commit `5113b82a4ed6416d6344efa50e41db8cb65928ff` (decisions 1 to 3 of the faithful Material 3 stage). 1 dp = 1 component unit; the container density converts it to image pixels (`docs/COMPONENT-FORMAT.md`, "Units and density"). The values come from the specialization tokens (`tokens`, in the `light` and `dark` modes), which mirror the androidx token files; no color, font or shape radius is literal in the component (the exception is the asymmetric track radii, below).

**Files used**

- `compose/material3/material3/src/commonMain/kotlin/androidx/compose/material3/Slider.kt` (line 298: `state.value = value`; lines 779 to 872: the `Layout` of the `Slider`, with the track offset by half the handle, the handle at `track * value` and, with `steps`, at `(track - 2 * corner) * value + corner`; 1026 to 1081: the same in the `RangeSlider`; 2740 to 2759: the `value` of the `SliderState` (`coerceIn` and `snapValueToTick`); 2952 to 2979: `activeRangeStart` and `activeRangeEnd` of the `RangeSliderState`, which do the same; 1163 to 1193: `defaultSliderColors`; 1207 to 1240: the 4 by 44 `Thumb` in the `HandleShape` shape; 1430 to 1447: the stop indicator in the active track color and the tick with `TickSize`; 1576 to 1660: `TrackImpl`; 1858 to 2112: `drawTrack` (handle gap, corners, ticks skipped in the gap; 2080 to 2111: the row of ticks and the color of each); 2114 to 2152: `drawTrackPath`; 2154 to 2162: `drawStopIndicator` and `TickSize`; 2167 to 2177: `snapValueToTick`; 2192 to 2194: `stepsToTickFractions`; 2652 to 2658: `TrackHeight`, `ThumbWidth`, `ThumbHeight`, `ThumbTrackGapSize` 6 and `TrackInsideCornerSize` 2).
- `compose/material3/material3/src/commonMain/kotlin/androidx/compose/material3/tokens/SliderTokens.kt` (lines 25 to 30: 4 by 44 handle and 6 gap; 32 and 56: 16 tracks; 31 and 55: active `primary` and inactive `secondary-container` colors; 35 to 41: disabled, with `on-surface` at 0.38 on the handle and the active segment and at 0.12 on the inactive one; 69: `StopIndicatorSize` 4).

**How the drawing follows Compose**

- The track measures the width minus 4 (half the handle on each side), is 16 high and is centered in the 44. The active segment is `primary` and goes from 0 to `value * track - 8`; the inactive one is `secondary-container` and goes from `value * track + 8` to the end. The 8 is half the handle (2) plus the `ThumbTrackGapSize` gap (6), as in `drawTrack`.
- The handle is a 4 by 44 rectangle in the `corner-full` shape, in `primary`, centered at `value * track`. `value` (single) and `valueStart` and `valueEnd` (range) are numbers from 0 to 1 at any fraction, clamped to that range (`coerceIn` in `Slider.kt` 2752, 2954 and 2969); an empty value uses the field default (0.5, 0.2 and 0.8). The track follows the instance width (`$size`). With the value snapped to 0 the active segment does not appear and at 1 the inactive one does not appear (the segment that does not exist comes out with width 0).
- Track corners: the outer one is half the height (8) and the inner one, next to the handle, is `TrackInsideCornerSize` (2). In range, the active segment has all four corners at 2 and each outer segment has the outer corner at 8.
- The stop indicator is a 4 circle 8 from the end of the track (and, in range, also 8 from the start), in the active track color (`primary`), as in the default `drawStopIndicator`. Without the inactive segment it does not appear.
- **`steps` snaps the value.** With `steps` greater than or equal to 1 the value goes to the nearest step, like the `SliderState`: `round(value × (steps + 1)) / (steps + 1)` (the `snapValueToTick` picks, among the fractions `k / (steps + 1)` of `stepsToTickFractions`, the one with the smallest distance, `Slider.kt` 2167 to 2177 and 2192 to 2194, after the `coerceIn` of 2751 to 2759; the `RangeSlider` does the same on `valueStart` and `valueEnd`, 2952 to 2979). With 0.37 and `steps` 4 the handle stays at 0.4. Without `steps` (empty, 0 or less than 1) the drawing is continuous, with no snapping; a `steps` with a fractional part counts as the integer below. The snapped value applies to everything: the handle, the inset and the two segments.
- **The ticks are exactly those of `steps`**, for any `steps` (before: 1 to 9, and from 10 on it drew as 9). Tick k, from 0 to `steps + 1`, sits at `8 + (width - 20) × k / (steps + 1)` (the `steps + 2` fractions of `stepsToTickFractions`, `Slider.kt` 2192 to 2194; the two ends and `steps` intermediate ones) and, with the handle on step `p`, tick `p` falls under the handle and is not drawn. The tick over the active segment is `secondary-container` and the one over the inactive one is `primary` (`activeTickColor` and `inactiveTickColor`, `Slider.kt` 2109): in single the ticks up to the handle belong to the active segment and those after it to the inactive one; in range, those between the handles belong to the active one and the outer ones to the inactive one. The row is a `repeat` by count (`steps + 2`, with `{ "$field": "$index" }` and the space between ticks computed from the width) and each position has two ellipses, one of each color, each visible only on its own segment.
- **The inset of 8** at the ends stays as in `Slider.kt` 779 to 872 and 1026 to 1081: with `steps`, the single handle away from the ends (snapped value greater than 0 and less than 1) and both range handles sit at `8 + (track - 16) × fraction`; at the ends, at `track × fraction`. Since the value already arrives snapped, 0.03 with `steps` 4 (which becomes 0) drops the inset, and 0.2 keeps it.
- **Without `steps`** there are no step ticks: only the stop indicator at the end (and, in range, the one at the start), each only with an inactive segment on its side of the handle, like the default `drawStopIndicator`.
- Disabled (`SliderTokens`): handle and active segment in `on-surface` at `state-disabled-content` (0.38) and inactive segment at `state-disabled-container` (0.12). The ticks and the indicator follow `disabledActiveTickColor` (0.12 over the active one) and `disabledInactiveTickColor` (0.38 over the inactive one).

**Interaction state (`interaction` field)**

The field chooses the resting appearance of a state, as `enabled` chooses the disabled state; it does not go into the `code` or the `variants`. The options are `none` and the states that the commit's `SliderTokens.kt` defines for the handle and the tracks: `hovered`, `focused` and `pressed` (there is no `Dragged*`, so there is no `dragged`).

- **Handle by state** (`handle` node; in range, the end one, same as single): `HoverHandleWidth` 4 (line 52, the usual width, so hovered draws the same as `none`), `FocusHandleWidth` 2 (line 44) and `PressedHandleWidth` 2 (line 62). The narrow handle stays centered at the same position (the same `handle` node, with width 2 instead of 4). The height stays 44.
- **Colors:** `HoverHandleColor`, `PressedHandleColor` and `HandleColor` (lines 51, 61 and 47) are `Primary`; the per-state tracks (`FocusActiveTrackColor`, `FocusInactiveTrackColor`, `PressedActiveTrackColor`, `PressedInactiveTrackColor`, lines 43, 45, 60 and 63) repeat the default `Primary` and `SecondaryContainer`; the stop indicators `HoverStopColor`, `FocusStopColor` and `PressedStopColor` (lines 53, 46 and 64) are `Primary`, the color the drawing already uses. No color changes by state.
- **State layer:** there is none, because the commit does not define it (above); so `state-hover`, `state-focus` and `state-pressed` do not enter the slider.
- **Disabled wins:** with `enabled` `false` the handle stays at 4 (`DisabledHandleWidth` 4, line 39), whatever the `interaction`.

**What still differs from Compose**

- The asymmetric track radii are `$token` per item of the `cornerRadius` list: `corner-track-outer` (8, half the 16 track height) and `corner-track-inside` (2, `TrackInsideCornerSize`), library tokens (the handle and the other shapes use `corner-full`).
- On an exact tie between two steps (for example, 0.1 with `steps` 4, which falls halfway between 0 and 0.2) the drawing rounds up, like `Math.round`; the `minByOrNull` of `snapValueToTick` (`Slider.kt` 2175) keeps the first, the smaller one, and the Compose `Float` fractions may break the tie differently.
- In range, with `steps`, the start handle at 0 and the end handle at 1 sit at `8 + (track - 16) × fraction`, not at the end as in Compose (only single handles the ends). The `RangeSliderState` also pins the end to the start (`Slider.kt` 2969); here an end smaller than the start is drawn as is.
- When disabled, the handle, the active segment and the ticks are `on-surface` at 0.38 and the inactive segment at 0.12, composited over `surface` and delivered opaque (`over: "surface"` in the `$token`), like the Compose `compositeOver(surface)`: the transparency does not stack with what is behind it.
- Ticks next to the handle: Compose skips the ticks less than 8 from the handle (`Slider.kt` 2090 to 2097); the drawing only stops drawing the one under it. With the handle at an end and `steps` on, the tick beside it (8 from the edge) is not drawn, as in Compose, which skips it for being 8 from the handle center (before, it appeared half-visible in the gap). Without `steps`, the end tick appears whenever there is an inactive segment after the handle (value less than 1); the earlier drawing cut it with the clip when the handle went past 97.5% of the range. In range without `steps` with both handles at the end, that tick (which used to sit before the start handle) is not drawn either.
- A range with a start greater than the end, or equal values, is drawn with no special handling (the active segment disappears or has width 0).
- With many `steps` the ticks stop fitting: when the space between centers (`(width − 20) / (steps + 1)`) drops below 1 px, or `steps + 2` would exceed 1000 (the `repeat` limit), the drawing carries no ticks (without the `repeat limited` warning) and each segment (active and inactive; in range, all three) becomes a 4 px high strip, corners of 2, from the first to the last tick that would be visible on it, in the color and opacity of that segment's ticks. Below that threshold the drawing is the one with ticks, unchanged.
- The Compose `Slider` measures 48 high (`minimumInteractiveComponentSize`, `Slider.kt` lines 789 and 1023, in the `Slider` and the `RangeSlider`) with the 44 handle (`SliderTokens.HandleHeight`) centered, and the `size` and `sizing` are 328 × 48: the 44 band is centered, with 2 left over above and below.
- No animated ripple and no transition between states (the drawing is a still frame); no value label (`ValueIndicator`) and no free `valueRange`: the type only has values from 0 to 1.
- No state layer around the handle: neither `SliderTokens.kt` nor the `Thumb` in the commit's `Slider.kt` has one (there is no `StateLayerSize` in the slider). Compose defines no focus ring for this type at the pinned commit (none of its `*Tokens.kt` carries `FocusIndicatorColor`): none is drawn.
- The gap between the handle and the tracks stays at 8 even with the 2 handle: Compose recomputes it as half the measured handle width plus 6 (7 with the narrow handle) and the track gets 1 on each side (`Slider.kt`, lines 1913 to 1919).
