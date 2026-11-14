# Time picker

Time picker. Picker shows the hour and minute fields with the clock; input shows only the fields to type in. Requires experimental opt-in.

Annotation type: `time-picker` (layer Components).

## Fields

| Key           | Label       | Type   | Required | Options                                 | Default  | Description                                                                                                                                                                                                                                                                                                                                |
| ------------- | ----------- | ------ | -------- | --------------------------------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `title`       | Title       | string | no       |                                         |          | Dialog title (the `title` of the TimePickerDialog). Empty = no title.                                                                                                                                                                                                                                                                      |
| `mode`        | Mode        | enum   | no       | `picker`, `input`                       | `picker` | picker is the clock (TimePicker); input is only the hour and minute fields (TimeInput).                                                                                                                                                                                                                                                    |
| `hour`        | Hour        | number | no       |                                         |          | Hour from 0 to 23 (initialHour), always in 24-hour format.                                                                                                                                                                                                                                                                                 |
| `minute`      | Minute      | number | no       |                                         |          | Minute from 0 to 59 (initialMinute).                                                                                                                                                                                                                                                                                                       |
| `is24Hour`    | 24 hours    | enum   | no       | `true`, `false`                         | `true`   | true uses 24 hours; false uses 12 hours with the AM/PM selector.                                                                                                                                                                                                                                                                           |
| `selection`   | Selecting   | enum   | no       | `hour`, `minute`                        | `hour`   | Which part is being chosen (the clock shows the hours or the minutes). It is the initial state, not a parameter.                                                                                                                                                                                                                           |
| `interaction` | Interaction | enum   | no       | `none`, `hovered`, `focused`, `pressed` | `none`   | Resting appearance of the interaction state of the chosen item (the hour selector or the minute one, whichever the selection picks): hovered, focused or pressed; none = no state. It only changes the drawing and does not go into the code. The type has no enabled, so there is no disabled state that wins: the state is always drawn. |

## Compose

- Symbol: `androidx.compose.material3.TimePicker`
- File (`path`): `compose/material3/material3/src/commonMain/kotlin/androidx/compose/material3/TimePicker.kt`
- The `mode` field chooses the symbol; values without their own case use the base one.

| `mode`          | Symbol       |
| --------------- | ------------ |
| `picker` (base) | `TimePicker` |
| `input`         | `TimeInput`  |

How the annotation becomes the call (the values below are examples; the parameter names and expressions are those of `params` and `values` in `code`):

```kotlin
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun TimeDialog(onDismiss: () -> Unit, onConfirm: (Int, Int) -> Unit) {
    val state = rememberTimePickerState(initialHour = 14, initialMinute = 30, is24Hour = true)
    TimePickerDialog(    // stable
        onDismissRequest = onDismiss,
        confirmButton = { TextButton(onClick = { onConfirm(state.hour, state.minute) }) { Text("OK") } },
        title = { Text("Select time") },
    ) {
        TimePicker(state = state)    // mode input: TimeInput(state = state)
    }
}
```

`code` notes (what the tool hands to the agent):

> Requires @OptIn(ExperimentalMaterial3Api::class): `TimePicker`, `TimeInput`, `rememberTimePickerState` and `TimePickerState` are experimental at the pinned commit. The `params` names are those of `rememberTimePickerState(initialHour = <hour>, initialMinute = <minute>, is24Hour = <is24Hour>)`, which creates the state; the call is `TimePicker(state = state)`. The composable has no title or buttons: in a dialog use `TimePickerDialog(onDismissRequest = …, confirmButton = { … }, title = { Text(<title>) }) { TimePicker(state = state) }` (the `TimePickerDialog` is stable). The result comes from `state.hour` and `state.minute`; `selection` is the initial `state.selection` (`TimePickerSelectionMode.Hour` or `Minute`).

`input` variant: Requires the same @OptIn(ExperimentalMaterial3Api::class). `TimeInput(state = state)` uses the same `state` from `rememberTimePickerState(initialHour = <hour>, initialMinute = <minute>, is24Hour = <is24Hour>)`, but draws only the hour and minute fields, without the clock; `selection` says which field starts focused. In a dialog, use the `TimePickerDialog` as in the base.

## Examples

- **Clock, hours**: title=Select time, mode=picker, hour=14, minute=30, is24Hour=true, selection=hour
- **Clock, minutes in 12 hours**: title=Select time, mode=picker, hour=9, minute=45, is24Hour=false, selection=minute
- **Fields**: title=Enter time, mode=input, hour=8, minute=5, is24Hour=false
- **24 hours, fields**: title=Enter time, mode=input, hour=18, minute=5, is24Hour=true
- **10:37 in 24 hours, minutes**: title=Select time, mode=picker, hour=10, minute=37, is24Hour=true, selection=minute
- **22:05 in 12 hours (PM)**: title=Select time, mode=picker, hour=22, minute=5, is24Hour=false, selection=hour
- **Hovered**: title=Select time, mode=picker, hour=14, minute=30, is24Hour=true, selection=hour, interaction=hovered
- **Focused**: title=Select time, mode=picker, hour=9, minute=45, is24Hour=false, selection=minute, interaction=focused
- **Pressed**: title=Enter time, mode=input, hour=8, minute=5, is24Hour=false, selection=hour, interaction=pressed

## Fidelity

Reference: Compose `material3` 1.4.0, commit `5113b82a4ed6416d6344efa50e41db8cb65928ff` (decisions 1 to 3 of the faithful Material 3 stage). 1 dp = 1 component unit; the container density converts it to image pixels (`docs/COMPONENT-FORMAT.md`, "Units and density"). The values come from the specialization tokens (`tokens`, in the `light` and `dark` modes), which mirror the androidx token files; no color, font or opacity is literal in the component.

**Files used**

- `compose/material3/material3/src/commonMain/kotlin/androidx/compose/material3/TimePicker.kt` (lines 349 to 376: `defaultTimePickerColors`, which binds each color role to the token, with the unselected period background transparent; 931 to 947: `selectorPos`, the handle on the outer radius or, only in 24 hours with PM, on the inner one; 953 to 971: `VerticalTimePicker`, the display, 36 margin (`ClockDisplayBottomMargin`) and the clock; 998 to 1130: `TimeInputImpl`; 1154 to 1200: `VerticalClockDisplay` and `ClockDisplayNumbers`, with the `PeriodToggleMargin` of 12; 1249 to 1292 and 1295 to 1377: `VerticalPeriodToggle` and `PeriodToggleImpl`, the 1 outline and the divider; 1380 to 1394: `DisplaySeparator`; 1398 to 1440: `TimeSelector`; 1587 to 1655: `ClockFace` and the two rings; 1657 to 1721: `drawSelector`, the 48 handle, the 2 track and the 8 center; 1723 to 1790: `ClockText` and the `toLocalString()` of the numbers; 1858 to 1960: `TimePickerTextField` and the support label at `SupportLabelTop`; 2066 to 2085: the constants `OuterCircleToSizeRatio` (101/256), `InnerCircleToSizeRatio` (69/256), `DisplaySeparatorWidth` 24, `SupportLabelTop` 7, `PeriodToggleMargin` 12 and `Hours`/`ExtraHours`).
- `compose/material3/material3/src/commonMain/kotlin/androidx/compose/material3/TimePickerDialog.kt` (lines 96 to 125: `TimePickerDialogLayout`, the dialog `Surface` with `DialogTokens`; 127 to 236: `TimePickerCustomLayout`, the 24 padding and the centered content; 261 to 285 and 295 to 311: `DisplayModeToggle` and `Title`, `labelMedium` with 20 of bottom padding).
- `compose/material3/material3/src/commonMain/kotlin/androidx/compose/material3/tokens/TimePickerTokens.kt` (lines 24 to 76: `ClockDialColor` `SurfaceContainerHighest`, `ClockDialContainerSize` 256, `ClockDialLabelTextFont` `BodyLarge`, `ClockDialSelectedLabelTextColor` `OnPrimary`, the `Primary` selector with a 48 handle, 2 track and 8 center, `ClockDialUnselectedLabelTextColor` `OnSurface`, `HeadlineColor` `OnSurfaceVariant`, `HeadlineFont` `LabelMedium`, the `CornerSmall` period of 52 × 80 with a 1 `Outline` outline, `TertiaryContainer` and `OnTertiaryContainer` selected, `OnSurfaceVariant` unselected, `TimeSelectorContainer` of 96 × 80 in the `CornerSmall` shape, `PrimaryContainer` and `OnPrimaryContainer` selected, `SurfaceContainerHighest` and `OnSurface` unselected, `DisplayLarge`).
- `compose/material3/material3/src/commonMain/kotlin/androidx/compose/material3/tokens/TimeInputTokens.kt` (lines 24 to 59: 96 × 72 fields, 52 × 72 period, `DisplayMedium` in the fields, `BodySmall` and `OnSurfaceVariant` in the support label, `Primary` focus outline of 2) and `TypeScaleTokens.kt` (the `display-large`, `display-medium`, `body-large`, `body-small`, `title-medium` and `label-medium` scales, which are the specialization typography tokens).

**How the drawing follows Compose**

- Dialog: `surface-container-high` (`DialogTokens.ContainerColor`), shape `corner-extra-large` (28) and padding of 24; the dialog elevation is tonal (level 3), with no shadow. Title in `label-medium` (12, line 16, weight 500, spacing 0.5) and `on-surface-variant`, in a 36 strip (the 16 line plus the `padding(bottom = 20)` of the `Title`).
- Hour and minute (96 × 80, shape `corner-small`, text in `display-large` 57/64): the selected one in `primary-container` with `on-primary-container`, the other in `surface-container-highest` with `on-surface`; 24 colon in `on-surface`. The numbers always have two digits (`toLocalString(minDigits = 2)`; in 12 hours hour 0 and 12 show 12): the leading zero comes from an `$if` with `$lt` that joins `"0"` to the number, and the 12-hour value from `((hour + 11) mod 12) + 1`. The PM period applies from 12 to 23 (`$gte`). The group centers on the content, and in 12 hours the period comes 12 after the minute.
- AM/PM period (52 × 80 on the clock, 52 × 72 in the fields): shape `corner-small`, 1 outline in `outline`, 1 divider in `outline` in the middle and labels in `title-medium`. The selected period uses `tertiary-container` with `on-tertiary-container` (it is the token's `PeriodSelectorSelectedContainerColor`), the other has no background and is in `on-surface-variant`. PM applies from 12 to 23.
- Clock: 256 circle in `surface-container-highest` (`corner-full`), 36 from the display. The numbers are in `body-large` (16/24, spacing 0.5) and `on-surface`, on the outer ring of radius 101 (the 12 of `Hours`; in 24 hours they show 0 to 11) and, only in 24 hours with the hour being selected, on the inner one of radius 69 (12 to 23). In minutes the outer ring shows 0, 5, 10… 55. The labels come from `toLocalString()` without `minDigits`, so without a leading zero (the commit's `ClockText`), unlike versions 1 to 3 of the component, which showed `00` and `05`.
- Selector: the 48 handle in `primary` (`corner-full`) sits at radius 101 or, in 24 hours with the hour from 12 to 23, at 69, at the angle of the hour (30° per hour, `hour mod 12`) or of the minute (6° per minute) from the top, through `$sin` and `$cos` of the angle counted from the top clockwise, as Compose does: `hourAngle = RadiansPerHour * (hour % 12) - FullCircle / 4` and `minuteAngle = RadiansPerMinute * minute - FullCircle / 4` (`TimePicker.kt`, lines 740 and 741, the quarter turn less puts zero at the top) and `selectorPos` (lines 945 and 946, `length * cos(currentAngle)` and `length * sin(currentAngle)` added to the center); here the point is `center + radius * sin(θ)` horizontally and `center - radius * cos(θ)` vertically, with θ counted from the top, which gives the same point; it carries inside the selected number in `body-large` and `on-primary` (a minute off the 5 grid has no number, as in Compose). The 2 track in `primary` goes from the center to the center of the handle (a stroke from `M128 128` to the same point, written with `$concat`; Compose ends it at the handle edge, `drawSelector`, lines 1657 to 1721, but the handle covers it) and the 8 center in `primary` closes the hand. The trigonometry stays and not the `rotation`: the handle (with the number inside) and the track need the end point, and it is the computation that Compose's `selectorPos` does; with `rotation` it would be a 256 frame rotated per hand, with the handle's number rotated back.
- Fields (`mode` = `input`): 96 × 72 fields in the `corner-small` shape with the number in `display-medium` 45/52; the focused field uses `primary-container` with `on-primary-container` and a 2 outline in `primary`, and the other `surface-container-highest` with `on-surface` and no outline. Labels "Hour" and "Minute" in `body-small` 12/16 and `on-surface-variant`, 7 (`SupportLabelTop`) below the field.
- Both modes use the same row of hour, minute and period: the `mode` only swaps the height (80 or 72), the font (`display-large` or `display-medium`), the focused field outline and the support label, which keeps the file smaller than in versions 1 to 3.
- The hour and minute numbers, the colon, the AM/PM, the clock numbers and the handle number are centered by the cap height (`font.verticalAlign: "cap-middle"`); the title and the "Hour" and "Minute" labels stay as they are. The Compose `Text` centers by the font line box; with Roboto the two coincide to within 1 px.

**What still differs from Compose**

- The dial numbers are a `repeat` by `count` (12, or 24 in 24 hours choosing the hour) of frames with no size, each with the number anchored by `$sin` and `$cos` of the index (30° per number, radius 101 or 69 by the index), as `ClockFace` positions the `ClockText` by `radiusPx * cos(theta * i - QuarterCircle)` and `sin` (`TimePicker.kt`, lines 1991 to 2002). The hand and the numbers follow the same radius, so changing the clock radius means changing both numbers in the file.
- Number overlapped by the handle: Compose draws over the handle, in `on-primary`, the part of the neighboring numbers that it covers (`drawSelector`, `BlendMode.DstOver`); here, without blending: the handle is a circular frame with `clip` and, inside it, a copy of the numbers in `on-primary`, shifted by the handle position (the expression anchors of `numbers under the handle`). A number covered halfway comes out half `on-primary`, half `on-surface`, and an hour or minute with no number underneath (10:37) shows the pieces of 35 and 40 that the handle covers. The MCP PNG clips the frame to the handle rectangle, not to the circle.
- Dialog width: the component `size` is 328, the 12-hour one (280 of content plus the 24 padding). In 24 hours Compose measures 304 on the clock (the 256 dial is the widest) and 264 in the fields; here the width stays at 328 and the content is centered. The "24 hours, fields" example shows the limit; roadmap #898 (measure by content) resolves it.
- Dialog height: the `size` is 328 × 528 (456 of content and padding, plus 24 of `ClockFaceBottomMargin`, `TimePicker.kt` line 2069, and plus 48 of the `TimePickerDialog` actions row, `TimePickerDialog.kt` lines 189 to 193, with the `TextButton` at `MinimumInteractiveSize` 48, `TimePicker.kt` line 2075). The actions row itself is not drawn: the button that toggles between clock and fields (`TimePickerDialogDefaults.DisplayModeToggle`, `Keyboard` and `Schedule` icons), cancel and confirm are left out, so the reserved margin and row are left over at the bottom, with only the background (an accepted effect, as in #863). The `TimePicker` itself has no such row, only the `TimePickerDialog`.
- Only the vertical layout of the `TimePicker`: the horizontal one (`HorizontalTimePicker`, in a short window) and the 238 and 200 clocks (`ClockFaceSizeModifier`) do not exist.
- The fields separator uses `display-medium`, the `LocalTextStyle` font of the `TimeInputImpl`; the `TimeFieldSeparatorFont` token says `display-large`, but the `DisplaySeparator` reads the local style.
- Interaction state (`interaction` field): `none`, `hovered`, `focused` and `pressed`, the options that `TimePickerTokens.kt` names for the hour and minute selector and for the period (`TimeSelectorSelectedHoverLabelTextColor`, `...FocusLabelTextColor`, `...PressedLabelTextColor`, lines 66 to 76, and the `PeriodSelector...` ones of lines 50 to 57). It applies to the **chosen selector**: the hour field or the minute one, according to the `selection`. The layer is the `state` node, a still rectangle the size of the field (96 × 80 on the clock, 96 × 72 in the fields, shape `corner-small`) in the text color of the selected field (`on-primary-container`, the `TimeSelector` content) with the opacity of `state-hover` (0.08), `state-focus` (0.10) or `state-pressed` (0.10). In input mode Compose draws a text field (no ripple), but the drawing uses the same layer in both modes. The type has no `enabled`, so the state is always drawn.
- No cursor, clock animation or `Crossfade`; the state of the AM/PM period and of the other field is not drawn: the drawing is an image of a single state (`selection` and the values say which).
- The "Hour" and "Minute" labels are fixed text in English (Compose reads them from `Strings`).

- `TimeInputTokens.kt` defines `FocusIndicatorColor` (line 27) for the typing mode field, and the 2 outline in `primary` of the focused field is already drawn (as before); the `focused` `interaction` only adds the state layer, not an extra focus ring.
