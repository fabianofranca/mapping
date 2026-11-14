# Spacer

Empty space between two components. Use it to space neighbors apart by a fixed amount or, with weight, to push them to the ends.

Annotation type: `spacer` (layer Layout).

## Fields

| Key      | Label  | Type   | Required | Options                 | Default | Description                                                                                        |
| -------- | ------ | ------ | -------- | ----------------------- | ------- | -------------------------------------------------------------------------------------------------- |
| `width`  | Width  | enum   | no       | `wrap`, `fill`, `fixed` | `fixed` | wrap fits the content, fill takes all the available width and fixed uses the marking width (dp).   |
| `height` | Height | enum   | no       | `wrap`, `fill`, `fixed` | `fixed` | wrap fits the content, fill takes all the available height and fixed uses the marking height (dp). |
| `weight` | Weight | number | no       |                         |         | Share of the leftover space in a Row or Column (Modifier.weight). Empty = no weight.               |

## Compose

- Symbol: `androidx.compose.foundation.layout.Spacer`
- File (`path`): `compose/foundation/foundation-layout/src/commonMain/kotlin/androidx/compose/foundation/layout/Spacer.kt`

How the annotation becomes the call (the values below are examples; the parameter names and expressions are those of `params` and `values` in `code`):

```kotlin
Spacer(Modifier.width(16.dp))      // width/height fixed, with the marking measurements
Spacer(Modifier.weight(1f))        // weight = 1, inside a Row or Column
```

`code` notes (what the tool hands to the agent):

> `Spacer` only takes a `Modifier`: `fixed` becomes `Modifier.width(<marking width>.dp)`/`height(<marking height>.dp)`, `fill` becomes `fillMaxWidth()`/`fillMaxHeight()` and `weight` becomes `Modifier.weight(<weight>f)` (the common use, to push neighbors in a Row or Column). `wrap` takes no space; it has no children.

## Examples

- **16 dp space**: width=fixed, height=fixed
- **Pushes to the end**: weight=1

## Fidelity

Reference: Compose `material3` 1.4.0, commit `5113b82a4ed6416d6344efa50e41db8cb65928ff` (decisions 1 to 3 of the faithful Material 3 stage). 1 dp = 1 component unit; the container density converts it to image pixels (`docs/COMPONENT-FORMAT.md`, "Units and density"). This type is from Foundation, not Material: it has no token file, and the drawing follows the foundation behavior, with the values coming from the fields.

**Files used**

- `compose/foundation/foundation-layout/src/commonMain/kotlin/androidx/compose/foundation/layout/Spacer.kt` (line 38: `Spacer(modifier: Modifier)`, which only takes space and draws nothing).
- `ShapeTokens.kt` and `TypeScaleTokens.kt` from Material (`CornerExtraSmall` 4 and `LabelSmall`) and `ColorLightTokens.kt`/`ColorDarkTokens.kt` (`Outline`, `OutlineVariant`), for the editing drawing.

**How the drawing follows Compose**

- The Compose `Spacer` does not draw: the dashed rectangle is a Mapping editing aid. It uses only tokens: `outline-variant` stroke, `corner-extra-small` radius and the measurements in `label-small` (size, line height, weight and spacing) in the `outline` color, with the `font-sans` font, in both modes.
- The measurements (`width`, `height`, `fixed`, `fill`, `wrap`, `weight`) come from the fields and the marking size, like `Modifier.width/height/weight`. The measurement text stays on a single line, centered, and ends in an ellipsis when the marking is narrower than it.

**What still differs from Compose**

- The dashed box and the measurement text do not exist in Compose; showing them is an editing decision.
- The text measurements went from 10/14 px to the 11/16 px and weight 500 of `label-small`, which are the theme tokens.
