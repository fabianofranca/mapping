# Progress indicator

Progress indicator. Circular spins in place; linear is a bar. With a value between 0 and 1 it is determinate; with no value it is indeterminate.

Annotation type: `progress-indicator` (Components layer).

## Fields

| Key          | Label       | Type   | Required | Options                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | Default    | Description                                                                                                                                                                              |
| ------------ | ----------- | ------ | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `shape`      | Shape       | enum   | no       | `circular`, `linear`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | `circular` | circular (CircularProgressIndicator) or linear (LinearProgressIndicator).                                                                                                                |
| `progress`   | Progress    | number | no       |                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |            | Progress from 0 to 1, exact (the drawing computes the arc and the width; a value outside the range is clamped to it). Empty = indeterminate (the drawing shows an arc or a partial bar). |
| `trackColor` | Track color | enum   | no       | `primary`, `onPrimary`, `primaryContainer`, `onPrimaryContainer`, `secondary`, `onSecondary`, `secondaryContainer`, `onSecondaryContainer`, `tertiary`, `onTertiary`, `tertiaryContainer`, `onTertiaryContainer`, `error`, `onError`, `errorContainer`, `onErrorContainer`, `background`, `onBackground`, `surface`, `onSurface`, `surfaceVariant`, `onSurfaceVariant`, `surfaceTint`, `inverseSurface`, `inverseOnSurface`, `inversePrimary`, `outline`, `outlineVariant`, `scrim`, `surfaceBright`, `surfaceDim`, `surfaceContainerLowest`, `surfaceContainerLow`, `surfaceContainer`, `surfaceContainerHigh`, `surfaceContainerHighest` |            | Theme color role used on the track (trackColor parameter). Empty = the Compose default: secondary container (the indeterminate circular has no track).                                   |
| `strokeCap`  | Stroke cap  | enum   | no       | `Round`, `Butt`, `Square`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | `Round`    | Cap of the stroke (strokeCap parameter, StrokeCap). The Compose default is Round in both shapes.                                                                                         |

## Compose

- Symbol: `androidx.compose.material3.CircularProgressIndicator`
- File (`path`): `compose/material3/material3/src/commonMain/kotlin/androidx/compose/material3/ProgressIndicator.kt`
- The `shape` field chooses the symbol; values without a case of their own use the base one.

| `shape`           | Symbol                      |
| ----------------- | --------------------------- |
| `circular` (base) | `CircularProgressIndicator` |
| `linear`          | `LinearProgressIndicator`   |

How the annotation becomes the call (the values below are examples; the parameter names and the expressions are those of `params` and `values` in `code`):

```kotlin
CircularProgressIndicator(    // shape linear: LinearProgressIndicator (same parameters)
    progress = { 0.6f },    // no progress in the annotation: call without this parameter (indeterminate)
)

LinearProgressIndicator(
    progress = { uploadProgress },    // screen state, from 0f to 1f
    modifier = Modifier.fillMaxWidth(),
)
```

Notes from `code` (what the tool hands to the agent):

> Stable, no opt-in. With `progress` filled, pass it as a lambda: `progress = { <progress>f }` (or bound to the screen state, for example `progress = { uploadProgress }`); the overload with `progress: Float` is `@Deprecated`. With `progress` empty, call without the parameter (indeterminate). The size comes from the `Modifier` (`Modifier.size(<marking width>.dp)` on the circular, which is 40 dp by default; `Modifier.fillMaxWidth()` on the linear). With `trackColor` filled, pass `trackColor = <trackColor>`; `strokeCap = <strokeCap>` (`StrokeCap` from `androidx.compose.ui.graphics`) only when the field differs from Round, the Compose default.

Variant `linear`: Stable, no opt-in. With `progress` filled, `progress = { <progress>f }`; empty is indeterminate (without the parameter). The bar takes the marking's width: `Modifier.fillMaxWidth()` or `Modifier.width(<marking width>.dp)`.

## Examples

- **Indeterminate circular**: shape=circular
- **Circular at 60%**: shape=circular, progress=0.6
- **Linear at 30%**: shape=linear, progress=0.3
- **Colored track and butt cap**: shape=linear, progress=0.4, trackColor=errorContainer, strokeCap=Butt

## Fidelity

Reference: Compose `material3` 1.4.0, commit `5113b82a4ed6416d6344efa50e41db8cb65928ff` (decisions 1 to 3 of the faithful Material 3 stage). 1 dp = 1 component unit; the container's density converts it to image pixels (`docs/COMPONENT-FORMAT.md`, "Units and density"). The values come from the specialization's tokens (`tokens`, in the `light` and `dark` modes), which mirror the androidx tokens files; no color, font or opacity is left literal in the component.

**Files used**

- `compose/material3/material3/src/commonMain/kotlin/androidx/compose/material3/ProgressIndicator.kt` (lines 139 to 185: determinate `LinearProgressIndicator`, track after the gap, indicator and stop; 249 to 345: the two-line indeterminate; 399 to 441: `drawLinearIndicator` and the round caps; 519 to 560: determinate `CircularProgressIndicator` (starts at 12 o'clock, `gapSizeSweep`); 624 to 690: the indeterminate; 749 to 768: `drawCircularIndicator`; 811 to 863: colors, `CircularStrokeWidth`, `StrokeCap.Round` and the gaps; 886 to 925: `drawStopIndicator`; 1032 to 1042: `LinearIndicatorWidth` 240, `LinearIndicatorHeight` and `CircularIndicatorDiameter`; 1047 to 1068: timings and `CircularIndeterminateMinProgress` 0.1 and `MaxProgress` 0.87).
- `compose/material3/material3/src/commonMain/kotlin/androidx/compose/material3/tokens/ProgressIndicatorTokens.kt` (lines 21 to 28: `ActiveIndicatorColor` `Primary` and `TrackColor` `SecondaryContainer`), `CircularProgressIndicatorTokens.kt` (`Size` 40, `TrackThickness` 4, `TrackActiveSpace` 4) and `LinearProgressIndicatorTokens.kt` (`Height` 4, `StopSize` 4, `TrackActiveSpace` 4).

**How the drawing follows Compose**

- Circular of **40** by 40 (`CircularIndicatorDiameter`), 4 stroke with a round cap, drawn at the center of the stroke (radius 18). The progress is clamped to 0 and 1 as in Compose (`coerceIn`, line 528) and the drawing computes the arc **from the exact value**, with no table: the `primary` indicator is an arc that starts at 12 o'clock and covers `sweep = progress x 360°` (line 541), with the end point at `(20 + 18 x sin(sweep), 20 - 18 x cos(sweep))` and the large-arc flag on when the progress goes past 0.5. The `secondary-container` track starts at `startAngle + sweep + min(sweep, gapSizeSweep)` and sweeps `360 - sweep - min(sweep, gapSizeSweep) x 2` (lines 551 and 552), with `gapSizeSweep` = (4 + 4) / (π x 40) x 360 ≈ 22.9° (lines 542 to 548); the `min` shortens the gap when the arc is smaller than it (progress below ~6.4%). In the drawing the track is the same arc drawn from 12 o'clock and rotated (`rotation`) to its start. The track has the large arc up to ~37.3% and a negative sweep from ~87.3%, when little is left: Compose calls `drawArc` with a negative sweep (line 552) and the drawing repeats it in reverse (direction flag 0). At 0 only the full track (sweep 360, `drawCircularIndicator` of lines 749 to 768, drawn as an ellipse) and at 1 only the indicator's ring.
- Linear with 4 height and the marking's width (Compose uses 240 if none is given). The progress is clamped to 0 and 1 (line 155) and the drawing computes the width **from the exact value**: the `primary` indicator goes from 0 to `progress x width` plus half a stroke of the round cap (+2, lines 411 to 424); the `secondary-container` track starts 4 after the tip (the gap between the round caps, `adjustedGapSize` of lines 167 to 173) and goes to the end; the stop is a 4 circle in `primary` against the end of the track (`StopIndicatorTrailingSpace` cuts nothing with a stop the size of the stroke). At 0 there is no bar and the track takes everything; at 1 only the full bar (the track is not drawn when `trackStartFraction` goes past 1, lines 177 to 181).
- Indeterminate (no `progress`): frozen frame of the animation. Circular: `primary` arc with no track (`circularIndeterminateTrackColor` is transparent) from 12 o'clock to the middle of the animated arc's travel ((0.1 + 0.87) / 2 of a turn). Linear: a bar between 30% and 70%, with the track on both sides and the gap of 4 (the first line of the two-line animation).
- The progress is not rounded: 0.333 and 0.6667 draw the arc and the width of 0.333 and 0.6667, at any value from 0 to 1, and a value outside the range is the nearest end (less than 0, as 0; greater than 1, as 1).

**What still differs from Compose**

- No animation (the indeterminate is a frame) and no progress transition.
- At 0 the linear draws no bar (the `abs(endFraction - startFraction) > 0` guard) and the circular does not either: Compose calls `drawArc` with a sweep of 0 and the drawing assumes that leaves no mark (not checked on a device).
- On the circular at 1 the negative-sweep track is not drawn: it sits under the indicator's ring, which covers everything.
- With the remaining track smaller than the gap of 6 (progress above ~97.5% at 240) the track segment is not drawn, and with it smaller than 4 (above ~98.3%) the stop of 4 is not either: the drawing lets nothing go past the track. The 100% bar goes 2 past the end (round cap) and the root clips it. With an indicator shorter than 8 (progress below ~3.3% at 240) Compose shortens the gap (`min(progress, gap)`); the drawing keeps the 4.
- `color`, `gapSize` and `strokeWidth` are fields and code, but the drawing does not use them; a custom `drawStopIndicator` is not a field of the type; the 40 circular is the default (the `Modifier.size` can change the diameter).
- `trackColor` and `strokeCap` are fields of the type. The default track is `secondary-container` (`ProgressIndicatorDefaults.linearTrackColor` and `circularDeterminateTrackColor`, `ProgressIndicator.kt` lines 820 to 835; `ProgressIndicatorTokens.TrackColor`), and the indeterminate circular has no track (lines 836 to 838), unless `trackColor` is filled. The default `strokeCap` is `Round` in all three (`LinearStrokeCap`, `CircularDeterminateStrokeCap` and `CircularIndeterminateStrokeCap`, lines 845 to 851). On the linear, `Butt` and `Square` cut straight (the ends of the bar and the track with no radius) and `Butt` opens the gap of 4 without adding the thickness (lines 164 to 170); `Square` opens the same gap as `Round`. On the circular the stroke's `cap` changes, but the arc ends and the angular gap between the indicator and the track follow the round-cap calculation: with `Butt` the gap is smaller than Compose's.
