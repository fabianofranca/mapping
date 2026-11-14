# FlowRow

A row that wraps to the next line when the children do not fit. Use it for groups of chips and tags.

Annotation type: `flow-row` (Layout layer).

## Fields

| Key                     | Label                   | Type   | Required | Options                                                                 | Default | Description                                                                                        |
| ----------------------- | ----------------------- | ------ | -------- | ----------------------------------------------------------------------- | ------- | -------------------------------------------------------------------------------------------------- |
| `horizontalArrangement` | Horizontal arrangement  | enum   | no       | `Start`, `End`, `Center`, `SpaceBetween`, `SpaceAround`, `SpaceEvenly`  | `Start` | How the children are distributed in each row (Arrangement).                                        |
| `verticalArrangement`   | Vertical arrangement    | enum   | no       | `Top`, `Bottom`, `Center`, `SpaceBetween`, `SpaceAround`, `SpaceEvenly` | `Top`   | How the rows are distributed on the vertical axis (Arrangement).                                   |
| `itemVerticalAlignment` | Item vertical alignment | enum   | no       | `Top`, `CenterVertically`, `Bottom`                                     | `Top`   | How the items align within each row (Alignment).                                                   |
| `maxItemsInEachRow`     | Max items per row       | number | no       |                                                                         |         | Limit of items in each row (Int). Empty = no limit.                                                |
| `maxLines`              | Max lines               | number | no       |                                                                         |         | Limit of rows (Int). Empty = no limit.                                                             |
| `spacing`               | Horizontal spacing (dp) | number | no       |                                                                         |         | Space between the items of a row in dp (Arrangement.spacedBy).                                     |
| `verticalSpacing`       | Vertical spacing (dp)   | number | no       |                                                                         |         | Space between the rows in dp (Arrangement.spacedBy).                                               |
| `padding`               | Padding (dp)            | number | no       |                                                                         |         | Modifier.padding in dp. Empty = 0.                                                                 |
| `width`                 | Width                   | enum   | no       | `wrap`, `fill`, `fixed`                                                 | `wrap`  | wrap fits the content, fill takes all the available width and fixed uses the marking width (dp).   |
| `height`                | Height                  | enum   | no       | `wrap`, `fill`, `fixed`                                                 | `wrap`  | wrap fits the content, fill takes all the available height and fixed uses the marking height (dp). |
| `weight`                | Weight                  | number | no       |                                                                         |         | Share of the leftover space in a Row or Column (Modifier.weight). Empty = no weight.               |

## Compose

- Symbol: `androidx.compose.foundation.layout.FlowRow`
- File (`path`): `compose/foundation/foundation-layout/src/commonMain/kotlin/androidx/compose/foundation/layout/FlowLayout.kt`

How the annotation becomes the call (the values below are examples; the parameter names and expressions are those of `params` and `values` in `code`):

```kotlin
FlowRow(
    horizontalArrangement = Arrangement.spacedBy(8.dp),
    verticalArrangement = Arrangement.spacedBy(8.dp),
    modifier = Modifier.fillMaxWidth(),
) {
    /* children (chips, tags) */
}
```

Notes from `code` (what the tool hands to the agent):

> The children go in `content`. `spacing` and `verticalSpacing` become `Arrangement.spacedBy(<n>.dp)` in `horizontalArrangement` and `verticalArrangement`; `maxItemsInEachRow` and `maxLines` go in only when filled, and `padding` becomes `Modifier.padding(<padding>.dp)`. Use the overload without the `overflow` parameter, which is the stable one. Size: `fill` becomes `Modifier.fillMaxWidth()`/`fillMaxHeight()`, `fixed` becomes `Modifier.width(<marking width>.dp)`/`height(<marking height>.dp)` and `weight` becomes `Modifier.weight(<weight>f)` (only inside a Row, Column or FlowRow).

## Examples

- **Chip group**: spacing=8, verticalSpacing=8, width=fill
- **Two rows at most**: spacing=12, maxLines=2, itemVerticalAlignment=CenterVertically, width=fill
- **Three per row**: spacing=8, verticalSpacing=12, maxItemsInEachRow=3, width=fill

## Fidelity

Reference: Compose `material3` 1.4.0, commit `5113b82a4ed6416d6344efa50e41db8cb65928ff` (decisions 1 to 3 of the faithful Material 3 stage). 1 dp = 1 component unit; the container density converts it to image pixels (`docs/COMPONENT-FORMAT.md`, "Units and density"). This type is from Foundation, not Material: it has no token file, and the drawing follows the foundation behavior, with the values coming from the fields.

**Files used**

- `compose/foundation/foundation-layout/src/commonMain/kotlin/androidx/compose/foundation/layout/FlowLayout.kt` (lines 91 to 99: `FlowRow(horizontalArrangement = Arrangement.Start, verticalArrangement = Arrangement.Top, itemVerticalAlignment = Alignment.Top, maxItemsInEachRow, maxLines)`).
- `compose/foundation/foundation-layout/src/commonMain/kotlin/androidx/compose/foundation/layout/Arrangement.kt` (lines 110 to 290: `Start`, `End`, `Top`, `Bottom`, `Center`, `SpaceEvenly`, `SpaceBetween`, `SpaceAround`; line 296: `spacedBy`).

**How the drawing follows Compose**

- `horizontalArrangement` becomes the slot's `justify` (`Start` `start`, `Center` `center`, `End` `end`, `SpaceBetween` `space-between`) and `itemVerticalAlignment` becomes the `align` (`Top` `start`, `CenterVertically` `center`, `Bottom` `end`), by `$switch` (format 4: expression in `layout.justify` and `layout.align`).
- `spacing` is the slot's `gap` and `padding` is its `padding`.
- The slot wraps into rows (`layout.wrap: "wrap"`, the `FlowRow`): `verticalSpacing` is the `lineGap` (the `verticalArrangement = spacedBy`), `maxItemsInEachRow` is the `maxPerLine` and `maxLines` is the `maxLines`. A child that does not fit in what is left of the row goes to the next one; `horizontalArrangement` and `itemVerticalAlignment` apply in each row. **Arrange** places the child markings this way, and the component is `hug` in height: it grows with the rows (the sum of the heights with the `verticalSpacing`).
- No color, font or radius is drawn.

**What still differs from Compose**

- `SpaceAround` and `SpaceEvenly` become `space-around` and `space-evenly` of the `justify`.
- The `verticalArrangement` between the rows has no effect beyond the `verticalSpacing`: the rows stay together at the start of the vertical axis (the format has no `alignContent`). Children beyond `maxLines` rows stay where they are in Arrange and are not drawn in the template drawing; the wrapping starts from each child's natural size.
