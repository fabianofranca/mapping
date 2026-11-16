# Snackbar

Quick, temporary notice at the bottom of the screen, with a short message, an optional action and, if wanted, the dismiss button.

Annotation type: `snackbar` (layer Components).

## Fields

| Key               | Label              | Type   | Required | Options         | Default | Description                                                                                                                                                    |
| ----------------- | ------------------ | ------ | -------- | --------------- | ------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `message`         | Message            | string | yes      |                 |         | Snackbar text.                                                                                                                                                 |
| `actionLabel`     | Action             | string | no       |                 |         | Action button text. Empty = no action.                                                                                                                         |
| `dismissAction`   | Dismiss button     | enum   | no       | `true`, `false` | `false` | true shows the dismiss button (Close icon) after the action.                                                                                                   |
| `actionOnNewLine` | Action on new line | enum   | no       | `true`, `false` | `false` | true puts the action below the message, for long texts (with one line of text the rectangle height goes from 48 to 92; the 68 is the single row of two lines). |

## Compose

- Symbol: `androidx.compose.material3.Snackbar`
- File (`path`): `compose/material3/material3/src/commonMain/kotlin/androidx/compose/material3/Snackbar.kt`

How the annotation becomes the call (the values below are examples; the parameter names and expressions are those of `params` and `values` in `code`):

```kotlin
val snackbarHostState = remember { SnackbarHostState() }
val scope = rememberCoroutineScope()

Scaffold(snackbarHost = { SnackbarHost(snackbarHostState) }) { innerPadding ->
    Button(
        onClick = {
            scope.launch {
                snackbarHostState.showSnackbar(
                    message = "Message archived",
                    actionLabel = "Undo",
                    withDismissAction = true,
                )
            }
        },
        modifier = Modifier.padding(innerPadding),
    ) { Text("Archive") }
}

// Custom look, without the host:
Snackbar(
    action = { TextButton(onClick = { /* undo */ }) { Text("Undo") } },
    dismissAction = { IconButton(onClick = { /* dismiss */ }) { Icon(Icons.Filled.Close, contentDescription = "Close") } },
    actionOnNewLine = false,
) { Text("Message archived") }
```

`code` notes (what the tool hands to the agent):

> Stable, no opt-in. The snackbar is usually shown by the `SnackbarHost` (file `SnackbarHost.kt`) in the `snackbarHost` slot of the Scaffold: `snackbarHost = { SnackbarHost(snackbarHostState) }`, with `val snackbarHostState = remember { SnackbarHostState() }`, and appears with `scope.launch { snackbarHostState.showSnackbar(message = <message>, actionLabel = <actionLabel>, withDismissAction = <dismissAction>) }`; in that case the `Snackbar` is the host default and is not called by hand. For a custom look, use `Snackbar(action = { TextButton(onClick = …) { Text(<actionLabel>) } }, dismissAction = { IconButton(onClick = …) { Icon(Icons.Filled.Close, contentDescription = …) } }, actionOnNewLine = <actionOnNewLine>) { Text(<message>) }`: `action` is only included with `actionLabel` filled and `dismissAction` only with `dismissAction = true`.

## Examples

- **Message only**: message=File saved
- **With action**: message=Message archived, actionLabel=Undo
- **With action and close**: message=No connection, actionLabel=Try again, dismissAction=true

## Fidelity

Reference: Compose `material3` 1.4.0, commit `5113b82a4ed6416d6344efa50e41db8cb65928ff` (decisions 1 to 3 of the faithful Material 3 stage). 1 dp = 1 component unit; the container density converts it to image pixels (`docs/COMPONENT-FORMAT.md`, "Units and density"). The values come from the specialization tokens (`tokens`, in the `light` and `dark` modes), which mirror the androidx token files; no color, font, radius or opacity is literal in the component, no text node declares `family` (all inherit `font-sans`) and the dismiss icon is the `icon` node of the library set (`close`), with no SVG path in the component.

**Files used**

- `compose/material3/material3/src/commonMain/kotlin/androidx/compose/material3/Snackbar.kt` (lines 100 to 140: `Snackbar`, the `Surface` with `shadowElevation = SnackbarTokens.ContainerElevation` (117) and the choice between `NewLineButtonSnackbar` and `OneRowSnackbar`; 197 to 250: the `Snackbar(snackbarData)`, the action `TextButton`, the `IconButton` with `Icons.Filled.Close` and the outer `padding(12.dp)` (238); 252 to 295: `NewLineButtonSnackbar`, `padding(start = 16, bottom = 2)`, `paddingFromBaseline(30, 12)` on the text and `padding(end = 8)` on the actions; 297 to 409: `OneRowSnackbar`, the text with `padding(vertical = 6)` (310), the text width without the buttons and without the 8 of `TextEndExtraSpacing` when there is no dismiss (344 to 347), the minimum height of 48 (366) or 68 (385) by the number of lines and the text 30 from the baseline (383) in the multi-line version; 411 to 435: `SnackbarDefaults`; 437 to 444: `ContainerMaxWidth` 600, `HeightToFirstLine` 30, `HorizontalSpacing` 16, `HorizontalSpacingButtonSide` 8, `SeparateButtonExtraY` 2, `SnackbarVerticalPadding` 6, `TextEndExtraSpacing` 8 and `LongButtonVerticalOffset` 12).
- `compose/material3/material3/src/commonMain/kotlin/androidx/compose/material3/tokens/SnackbarTokens.kt` (lines 26 and 27: action in `InversePrimary` and `LabelLarge`; 29 to 31: container `InverseSurface`, `ContainerElevation` `Level3` and shape `CornerExtraSmall`; 32 and 36: 24 icon `InverseOnSurface`; 37 and 38: text in `InverseOnSurface` and `BodyMedium`; 39 and 40: heights 48 and 68), `ElevationTokens.kt` (`Level3` 6 dp) and `ShapeTokens.kt` (line 38: `CornerExtraSmall` 4).
- `compose/material3/material3/src/commonMain/kotlin/androidx/compose/material3/Button.kt` (lines 497 to 510 and 527: `TextButtonContentPadding` of 12 and `MinWidth` 58), `IconButton.kt` (lines 177 to 179: `minimumInteractiveComponentSize()` and `smallContainerSize()`, the 40 container) and `Surface.kt` (line 219: the 48 touch target of the clickable `Surface`).
- `compose/material3/material3/src/commonMain/kotlin/androidx/compose/material3/tokens/TypeScaleTokens.kt` (`BodyMedium` 14/20/400/0.2 and `LabelLarge` 14/20/500/0.1).

**How the drawing follows Compose**

- Container `inverse-surface` with `corner-extra-small` (4) and the two level 3 shadows (point: `y` 1, `blur` 3; ambient: `y` 4, `blur` 8, `spread` 3; tokens `elevation-3-point-*` and `elevation-3-ambient-*`), in light and dark: in dark the background is light and the text dark, because the `inverse-*` roles swap with the mode.
- Message in `body-medium` (14/20) in `inverse-on-surface`, 16 from the edge. Action (`TextButton`) in `label-large` in `inverse-primary`, with 12 on each side, 58 minimum and 48 high (the 40 of the button plus the minimum touch target); dismiss is an `IconButton` with the 48 area and the 24 `close` icon in `inverse-on-surface`, flush right (12 from the icon to the edge).
- One line: minimum height of 48 (`SingleLineContainerHeight`), message centered in the height. With an action and no dismiss, the action ends 8 from the edge (`HorizontalSpacingButtonSide`) and the message 8 from it (`TextEndExtraSpacing`); with no action or dismiss, the message has 16 on both sides (8 + 8); with dismiss there is no slack between the message and the action, and the dismiss touches the edge.
- Two or more lines (`OneRowSnackbar`, `Snackbar.kt` lines 382 to 394): the first text baseline sits 30 from the top (`HeightToFirstLine`, lines 383 and 384; the text carries `baselinePadding.top` 30) and the last 11 from the bottom of the text box (the 6 of `SnackbarVerticalPadding`, line 310, plus the 5 from the baseline to the end of the Roboto 14/20 line); the height is the larger of 68 (`TwoLinesContainerHeight`, line 385) and the text's (lines 386 and 387): two lines measure 68 and three measure 81 (30 + 40 + 11), as in Compose. The action and the dismiss are centered in the height (lines 388 to 400). What chooses between the two drawings is the `$lines` of the `message` text: with one line the `message` frame appears (14 of room, centered text, height 48) and with two or more, the `multi-line message` frame, and the `minHeight` of the row goes from 48 to 68 (the type has `sizing` with height `hug`, so Arrange and `fit_marking` take the marking to 48, 68 or 81).
- Action on a new line (`actionOnNewLine` with the action filled; without an action Compose falls back to the single row, and so does the drawing): the first message baseline 30 from the top and the last 12 from the end of the box (`paddingFromBaseline(30, 12)`, line 269; `baselinePadding` 30 and 12), the actions in a 48 row on the right and 2 of margin below (line 266): 30 + 12 + 48 + 2 = 92 for one line of text, and 20 more per line.
- Maximum width of 600 (`ContainerMaxWidth`, the root `maxWidth`).
- Single-line label centered by the cap height (`cap-middle`): the `action label` node (the `message` stays as is) uses `font.verticalAlign: "cap-middle"` and takes the box height (`height: "fill"`), without changing the horizontal position. The Compose `Text` centers by the font line box (ascent and descent); the drawing centers the cap height in the box, and with Roboto the two coincide to within 1 px.

**What still differs from Compose**

- The number of lines comes from the measurer of whoever draws (the app, the MCP PNG, the approximate measurer in the tests): the wrap can differ from Android's Roboto, and with it the choice between 48, 68 and 81. The 11 at the end is the floor: with a font whose baseline is more than 5 from the end of the line, the distance is the font's, as in Compose.
- The limit of 600 only applies when the component is measured without a rectangle (`hug`), and this component's `sizing` is `fill` in width; with the marking drawn the width is the marking's.
- The two shadows (point and ambient) come from the `elevation-3-point-*` and `elevation-3-ambient-*` tokens (`$token` in `shadow`, a list of two shadows with `spread`); the tonal elevation is not drawn. Material 3 elevation values for the web: `elevation/internal/_elevation.scss` of `material-components/material-web` (version 2.5.0, commit `37aa14b843dcaeb3a46f898679fa6fcd109b1905`), a source outside Compose, which on Android hands the elevation to the platform and does not carry the numbers: point shadow in black at 30% and ambient shadow in black at 15%, with `y`, `blur` and `spread` per level (tokens `elevation-3-point-*` and `elevation-3-ambient-*`).
- Outside the drawing: the `SnackbarHost` (position on the screen, the 12 margin of the `Snackbar(snackbarData)`, the queue, the display time and the animation), the pressed, focused and hovered states, and the dismiss `contentDescription`.
