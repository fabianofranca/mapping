# Tooltip

Hint that appears beside an element (the anchor) on tap, press or pointer hover. Plain carries only a short text; rich carries a title, text and an action.

Annotation type: `tooltip` (layer Components).

## Fields

| Key      | Label  | Type   | Required | Options         | Default | Description                                                                      |
| -------- | ------ | ------ | -------- | --------------- | ------- | -------------------------------------------------------------------------------- |
| `style`  | Style  | enum   | no       | `plain`, `rich` | `plain` | plain (PlainTooltip, text only) or rich (RichTooltip, with title and action).    |
| `text`   | Text   | string | yes      |                 |         | Tooltip text.                                                                    |
| `title`  | Title  | string | no       |                 |         | Title of the rich tooltip. Empty = no title. Only applies to rich.               |
| `action` | Action | string | no       |                 |         | Text of the rich tooltip action button. Empty = no action. Only applies to rich. |

## Compose

- Symbol: `androidx.compose.material3.PlainTooltip`
- File (`path`): `compose/material3/material3/src/commonMain/kotlin/androidx/compose/material3/Tooltip.kt`
- The `style` field chooses the symbol; values without their own case use the base one.

| `style`        | Symbol         |
| -------------- | -------------- |
| `plain` (base) | `PlainTooltip` |
| `rich`         | `RichTooltip`  |

How the annotation becomes the call (the values below are examples; the parameter names and expressions are those of `params` and `values` in `code`):

```kotlin
TooltipBox(    // style rich: tooltip = { RichTooltip(title = { Text("Airplane mode") }, action = { … }) { Text("…") } }
    positionProvider = TooltipDefaults.rememberTooltipPositionProvider(TooltipAnchorPosition.Above),
    tooltip = { PlainTooltip { Text("Add to favorites") } },
    state = rememberTooltipState(),
) {
    IconButton(onClick = { /* ... */ }) {
        Icon(Icons.Filled.Favorite, contentDescription = "Add to favorites")
    }
}
```

`code` notes (what the tool hands to the agent):

> Requires @OptIn(ExperimentalMaterial3Api::class) (TooltipBox, PlainTooltip and RichTooltip are experimental at the pinned commit). The tooltip does not exist alone: wrap the anchor element in `TooltipBox(positionProvider = TooltipDefaults.rememberTooltipPositionProvider(TooltipAnchorPosition.Above), tooltip = { PlainTooltip { Text(<text>) } }, state = rememberTooltipState()) { <anchor> }`; the `rememberTooltipPositionProvider()` overload with no argument is `@Deprecated` at the pinned commit, hence the position argument (`Above`, `Below`, `Start`, `End`, `Left`, `Right`). The `PlainTooltip` and the `RichTooltip` are extensions of the `TooltipScope` received by the `tooltip` lambda. The anchor is the marking under the tooltip; the text goes in the `content` lambda of the `PlainTooltip`. With the marking anchored (`anchor`), its side chooses the position (`top` → `TooltipAnchorPosition.Above`, `bottom` → `Below`, `start` → `Start`, `end` → `End`, which follow the direction) and the spacing is Compose's `SpacingBetweenTooltipAndAnchor`, 4 dp (the `rememberTooltipPositionProvider` default); the 16 × 8 dp caret under the anchor center is `caretShape = TooltipDefaults.caretShape()` on the `PlainTooltip`; without an anchor the marking has no caret, like Compose's `caretShape = null`.

`rich` variant: Requires @OptIn(ExperimentalMaterial3Api::class). The same `TooltipBox`, with `tooltip = { RichTooltip(title = { Text(<title>) }, action = { TextButton(onClick = { /* ... */ }) { Text(<action>) } }) { Text(<text>) } }`, `state = rememberTooltipState(isPersistent = true)` when there is an `action` (so the tooltip does not vanish before the tap) and `TooltipBox(hasAction = true, …)`. `title` and `action` are only included when filled; the `text` goes in the final lambda (the `text` parameter). Anchored, it also carries `caretShape = TooltipDefaults.caretShape()` on the `RichTooltip`.

## Examples

- **Plain**: style=plain, text=Add to favorites

## Fidelity

Reference: Compose `material3` 1.4.0, commit `5113b82a4ed6416d6344efa50e41db8cb65928ff` (decisions 1 to 3 of the faithful Material 3 stage). 1 dp = 1 component unit; the container density converts it to image pixels (`docs/COMPONENT-FORMAT.md`, "Units and density"). The values come from the specialization tokens (`tokens`, in the `light` and `dark` modes), which mirror the androidx token files; no color, font, radius or color opacity is literal in the component and no text node declares `family` (all inherit `font-sans`).

**Files used**

- `compose/material3/material3/src/commonMain/kotlin/androidx/compose/material3/Tooltip.kt` (lines 421 to 481: `PlainTooltip`, the `Surface` (456) with `sizeIn(minWidth = TooltipMinWidth, maxWidth, minHeight = TooltipMinHeight)` and `padding(PlainTooltipContentPadding)` (464 to 470) and the style `PlainTooltipTokens.SupportingTextFont` (472); 530 to 616: `RichTooltip`, the `Surface` (568) with the same `sizeIn` (570 to 574), the `Column` with `padding(horizontal = RichTooltipHorizontalPadding)` (584), the title with `paddingFromBaseline(top = HeightToSubheadFirstLine)` (586), the text with `textVerticalPadding` (594) and the action with `requiredHeightIn(min = ActionLabelMinHeight)` and `padding(bottom = ActionLabelBottomPadding)` (604 and 605); 620 to 644: `TooltipDefaults`, the shapes and the `plainTooltipMaxWidth` 200 (641) and `richTooltipMaxWidth` 320 (644); 681 to 690: the rich colors; 1251 to 1258: `textVerticalPadding`; 1641 to 1653: `TooltipMinHeight` 24, `TooltipMinWidth` 40, `PlainTooltipVerticalPadding` 4, `PlainTooltipHorizontalPadding` 8, `RichTooltipHorizontalPadding` 16, `HeightToSubheadFirstLine` 28, `HeightFromSubheadToTextFirstLine` 24, `TextBottomPadding` 16, `ActionLabelMinHeight` 36 and `ActionLabelBottomPadding` 8).
- `compose/material3/material3/src/commonMain/kotlin/androidx/compose/material3/tokens/PlainTooltipTokens.kt` (lines 20 to 23: container `InverseSurface`, shape `CornerExtraSmall`, text `InverseOnSurface` in `BodySmall`) and `tokens/RichTooltipTokens.kt` (lines 24 to 33: action in `Primary` and `LabelLarge`, container `SurfaceContainer`, `ContainerElevation` `Level2`, shape `CornerMedium`, title `OnSurfaceVariant` in `TitleSmall`, text `OnSurfaceVariant` in `BodyMedium`).
- `compose/material3/material3/src/commonMain/kotlin/androidx/compose/material3/tokens/ElevationTokens.kt` (`Level2` 3 dp), `tokens/ShapeTokens.kt` (`CornerExtraSmall` 4 and `CornerMedium` 12) and `tokens/TypeScaleTokens.kt` (`BodySmall` 12/16/400/0.4, `BodyMedium` 14/20/400/0.2, `TitleSmall` 14/20/500/0.1 and `LabelLarge` 14/20/500/0.1).
- `compose/material3/material3/src/commonMain/kotlin/androidx/compose/material3/Button.kt` (lines 479 to 543: `TextButtonContentPadding` 12 and `MinHeight` 40), the rich action is a `TextButton`.

**How the drawing follows Compose**

- Anchored (`anchor` on the marking, `formatVersion` 4), the tooltip draws the `TooltipDefaults.caretSize` caret (16 × 8, the `DefaultTooltipCaretShape`: the triangle with a 16 base on the card edge and the 8 tip pointing outward, toward the anchor) under the anchor center, on all four sides: `top` (the tooltip above the anchor, the caret on the bottom edge pointing down), `bottom`, `start` and `end` (which follow the direction: in `rtl` they swap edges and the caret flips, through `mirror`). The template chooses the side by `$anchor.side` and places the caret by `$anchor.x` and `$anchor.y`; the color is the card's (`inverse-surface` on plain, `surface-container` on rich). The root does not clip (`clip: false`) so the caret can go past the marking box, as in Compose, and the default `anchor` (`top`, `center`, 4) comes from the spacing of `rememberTooltipPositionProvider`.
- Plain: pill in `inverse-surface` with `corner-extra-small` (4) and text in `body-small` (12/16) in `inverse-on-surface`; the two `inverse-*` roles swap with the mode, so in dark the background is light and the text dark. Padding of 8 on the sides and 4 above and below (`PlainTooltipContentPadding`), which gives 24 with one line. Width between 40 (`TooltipMinWidth`, `minWidth`) and 200 (`plainTooltipMaxWidth`, `maxWidth`), counting the padding like the Compose `sizeIn`; the text carries the `maxWidth` of 184 and wraps in lines of 16 without `maxLines`, because the `PlainTooltip` does not cut the text.
- Rich: card in `surface-container` with `corner-medium` (12) and the two level 2 shadows (point: `y` 1, `blur` 2; ambient: `y` 2, `blur` 6, `spread` 2; tokens `elevation-2-point-*` and `elevation-2-ambient-*`), 40 to 320 wide (`minWidth`, `maxWidth`) and 24 minimum height. Horizontal room of 16 (`RichTooltipHorizontalPadding`); title in `title-small` and text in `body-medium`, both in `on-surface-variant`; action in `label-large` in `primary`, inside a 40 `TextButton` with 12 on each side.
- Verticals by Compose's `paddingFromBaseline` and `textVerticalPadding`, with `baselinePadding` (the baseline of whoever draws, in any font): the title has its first baseline 28 from the top (`HeightToSubheadFirstLine`, `Tooltip.kt` lines 586 and 1649); the text, 24 from the **end of the title box** (`HeightFromSubheadToTextFirstLine`, lines 1255 and 1650) and 16 to the end (`TextBottomPadding`, lines 1256 and 1651); with no title and with an action, the text baseline sits 24 from the top; with no title and no action, 4 above and below (`PlainTooltipVerticalPadding`, line 1253), with padding only. The action comes 16 below the end of the text and 8 before the end (`ActionLabelBottomPadding`, line 605). The 24 count from the end of the title box, not from its baseline: the androidx test checks `subheadBound.bottom + 24.dp - textBaseLine` (`TooltipTest.kt` line 260 in `compose/material3/material3/src/androidInstrumentedTest/kotlin/androidx/compose/material3/`), so the text baseline is 29 below the title baseline, not 24.
- Heights for one line of text: plain 24; rich with text only 28; with title 78; with title and action 126; with action and no title 93. A multi-line title or text adds 20 per line.
- Labels centered by the cap height (`cap-middle`): the rich tooltip's `action label` uses `font.verticalAlign: "cap-middle"` and takes the height of the 40 button (`height: "fill"`); the plain tooltip's `text` uses the same value and stays `hug`, because the parent measures by the text. The rich tooltip's text and title, which are paragraphs, stay as they are. The Compose `Text` centers by the font line box (ascent and descent); the drawing centers the cap height in the box, and with Roboto the two coincide to within 1 px.

**What still differs from Compose**

- Three numbers in the drawing are not Compose constants: the title's `bottom` 6, the text's `top` 23 with a title and the text's `bottom` 21. They write the same positioning so the height comes out whole with the Roboto 14/20 baseline (14.83 in the approximate measurer, 15 in Compose): the Compose title box measures 28 + 5 and the text sits 24 below it; the drawing uses 28 + 6 and 23, and the two baselines land on the same 28 and 57 (29 apart); the 21 is the 16 of `TextBottomPadding` plus the 5 from the baseline to the end of the line. The `baselinePadding` never goes below the font distance, so with a font whose baseline is farther from the end of the line the space grows, as in Compose.
- Action height: the `Box` with `requiredHeightIn(min = 36)` wraps the `TextButton` that the screen passes, which measures 40 (`MinHeight`); the drawing assumes the default `TextButton`, like the type's `code`. An action of another size is not drawn.
- The action label sits 12 from the text edge (the `TextButtonContentPadding`): Compose also insets it, and the label does not align with the body text.
- The `TooltipBox` and the window do not exist in the drawing: the position relative to the anchor is the marking's (the root declares `anchor` `top`/`center` with `offset.main` 4, the `SpacingBetweenTooltipAndAnchor`, and Snap to anchor places it); Compose also flips the side when the tooltip hits the window edge (`abovePositioning` and the others), and the drawing stays on the requested side.
- The caret tip (8) goes past the default spacing (4) and enters the anchor by 4: the tooltip sits 4 from the anchor, like the `SpacingBetweenTooltipAndAnchor` of the `TooltipBox`, which is the same with or without a caret. For the tip to just touch the anchor edge, put a main `offset` of 8 on the marking (R12.35 does this).
- The caret is drawing only, and only with an anchor (Compose's `caretShape` is optional, `null` by default): without an anchor the marking has no caret. Clamping the caret inside the tooltip and the deviation when the tooltip is shifted by the window are not drawn: the caret sits under the anchor center (`$anchor.x`), and if the anchor is far from the tooltip it leaves the card. The rich tooltip caret carries no shadow.
- The two shadows (point and ambient) come from the `elevation-2-point-*` and `elevation-2-ambient-*` tokens (`$token` in `shadow`, a list of two shadows with `spread`); the tonal elevation is not drawn. Material 3 elevation values for the web: `elevation/internal/_elevation.scss` of `material-components/material-web` (version 2.5.0, commit `37aa14b843dcaeb3a46f898679fa6fcd109b1905`), a source outside Compose, which on Android hands the elevation to the platform and does not carry the numbers: point shadow in black at 30% and ambient shadow in black at 15%, with `y`, `blur` and `spread` per level (tokens `elevation-2-point-*` and `elevation-2-ambient-*`). The plain one has no shadow (`shadowElevation` 0).
- A `RichTooltip` with `maxWidth` greater than the marking width is limited by the marking (`fill`); the rich one with no rectangle (measured) is at most 320.
- The initial `size` (240 × 24) is that of `plain`, and the `rich` measures from 28 (text only) to more than 100 (with title and action): that is why the type has no `rich` example, which would go past the box and make the drawing check warn `content larger than the box`. On a marking, choose `style` rich and use Arrange (`sizing` `hug`) so the height follows the content.
- No enter and exit animation, no focused and pressed states, and no `contentDescription` of the `TooltipBox`.
