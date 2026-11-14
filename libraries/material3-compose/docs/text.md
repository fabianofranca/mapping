# Text

Text in the theme typography. Use it for titles, paragraphs, labels and any loose text.

Annotation type: `text` (layer Content).

## Fields

| Key         | Label          | Type   | Required | Options                                                           | Default     | Description                                                                                        |
| ----------- | -------------- | ------ | -------- | ----------------------------------------------------------------- | ----------- | -------------------------------------------------------------------------------------------------- |
| `text`      | Text           | string | yes      |                                                                   |             | The text shown.                                                                                    |
| `style`     | Style          | enum   | no       | `MaterialTheme.typography` roles (`displayLarge` to `labelSmall`) | `bodyLarge` | Theme typography role (MaterialTheme.typography).                                                  |
| `color`     | Color          | enum   | no       | `ColorScheme` roles                                               |             | Theme color role. Empty = content color (LocalContentColor).                                       |
| `textAlign` | Text alignment | enum   | no       | `Start`, `Center`, `End`, `Justify`                               |             | Horizontal text alignment (TextAlign). Empty = Compose default.                                    |
| `maxLines`  | Max lines      | number | no       |                                                                   |             | Line limit (Int). Empty = no limit.                                                                |
| `width`     | Width          | enum   | no       | `wrap`, `fill`, `fixed`                                           | `wrap`      | wrap fits the content, fill takes all the available width and fixed uses the marking width (dp).   |
| `height`    | Height         | enum   | no       | `wrap`, `fill`, `fixed`                                           | `wrap`      | wrap fits the content, fill takes all the available height and fixed uses the marking height (dp). |
| `weight`    | Weight         | number | no       |                                                                   |             | Share of the leftover space in a Row or Column (Modifier.weight). Empty = no weight.               |

## Compose

- Symbol: `androidx.compose.material3.Text`
- File (`path`): `compose/material3/material3/src/commonMain/kotlin/androidx/compose/material3/Text.kt`

How the annotation becomes the call (the values below are examples; the parameter names and expressions are those of `params` and `values` in `code`):

```kotlin
Text(
    text = "Settings",
    style = MaterialTheme.typography.headlineMedium,
    color = MaterialTheme.colorScheme.onSurfaceVariant,   // only if color is filled
    textAlign = TextAlign.Center,                          // only if textAlign is filled
    maxLines = 2,                                          // only if maxLines is filled
)
```

`code` notes (what the tool hands to the agent):

> `color` and `textAlign` are only included when filled; with `maxLines`, consider `overflow = TextOverflow.Ellipsis`. If the app uses string resources, the `text` becomes `stringResource(R.string.x)`. Size: `fill` becomes `Modifier.fillMaxWidth()`/`fillMaxHeight()`, `fixed` becomes `Modifier.width(<marking width>.dp)`/`height(<marking height>.dp)` and `weight` becomes `Modifier.weight(<weight>f)` (only inside Row, Column or FlowRow).

## Examples

- **Screen title**: text=Settings, style=headlineSmall
- **Paragraph**: text=Short supporting text., style=bodyMedium, color=onSurfaceVariant
- **Centered label**: text=Save, style=labelLarge, textAlign=Center, width=fill

## Fidelity

Reference: Compose `material3` 1.4.0, commit `5113b82a4ed6416d6344efa50e41db8cb65928ff` (decisions 1 to 3 of the faithful Material 3 stage). 1 dp = 1 component unit; the container density converts it to image pixels (`docs/COMPONENT-FORMAT.md`, "Units and density"). The values come from the specialization tokens (`tokens`, in the `light` and `dark` modes), which mirror the androidx token files; no color, font or radius is literal in the component.

**Files used**

- `compose/material3/material3/src/commonMain/kotlin/androidx/compose/material3/Text.kt` (lines 105 to 120: `color`, `overflow = TextOverflow.Clip`, `softWrap = true`, `maxLines = Int.MAX_VALUE` and `style = LocalTextStyle.current`).
- `compose/material3/material3/src/commonMain/kotlin/androidx/compose/material3/tokens/TypeScaleTokens.kt`: size, line height, weight and letter spacing of the 15 scales (`BodyLargeSize` 16 sp on line 26, `LabelLargeWeight` on line 73, `TitleMediumTracking` 0.2 sp on line 92…).
- `compose/material3/material3/src/commonMain/kotlin/androidx/compose/material3/tokens/ColorLightTokens.kt` and `ColorDarkTokens.kt`: the color roles (`color`).

**How the drawing follows Compose**

- Each style reads `<scale>-size`, `<scale>-line-height`, `<scale>-weight` and `<scale>-tracking` (for example `body-large-size`); without `style`, `bodyLarge` applies.
- The family is not written in the component: the text inherits the specialization's `font-sans` (Roboto), as the Compose `TypefaceTokens.Plain` inherits the theme font.
- The color is the role chosen in `color`; without `color`, the inherited content color (`on-surface` when nothing offers one). Each role has the `light` mode color and the `dark` one.
- `maxLines` cuts the text at the last allowed line, with no ellipsis, because the `Text` default is `TextOverflow.Clip` (`font.maxLines`, without `ellipsis`).

**What still differs from Compose**

- `textAlign = Justify` draws justified (`font.align: "justify"`): the lines stretch to both edges of the box and the last line of each paragraph stays on the left, like `TextAlign.Justify` (`Text.kt`, line 133: `textAlign` goes to the style).
- Without `color`, the text reads the inherited content color (`LocalContentColor`, `Text.kt`, line 123: `color.takeOrElse { style.color.takeOrElse { LocalContentColor.current } }`): inside a `surface` or `scaffold` it comes out in the color the parent offers (for example `on-primary` over `primary`), and with no parent, in `on-surface`. A chosen `color` wins over inheritance.
- The `*Emphasized` variants of the scale (Material 3 Expressive) are out of scope for the stage.
