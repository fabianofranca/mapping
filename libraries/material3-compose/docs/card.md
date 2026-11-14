# Card

Card that groups related content. Filled and elevated stand out through the background and the shadow; outlined, through the outline.

Annotation type: `card` (Components layer).

## Fields

| Key              | Label       | Type   | Required | Options                                            | Default  | Description                                                                                                                                                                                                                |
| ---------------- | ----------- | ------ | -------- | -------------------------------------------------- | -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `title`          | Title       | string | yes      |                                                    |          | Card title.                                                                                                                                                                                                                |
| `subtitle`       | Subtitle    | string | no       |                                                    |          | Supporting line below the title.                                                                                                                                                                                           |
| `supportingText` | Text        | string | no       |                                                    |          | Supporting paragraph of the card.                                                                                                                                                                                          |
| `media`          | Image (URL) | string | no       |                                                    |          | https:// address of the image at the top of the card. Empty = no image.                                                                                                                                                    |
| `style`          | Style       | enum   | no       | `filled`, `elevated`, `outlined`                   | `filled` | filled (Card), elevated or outlined.                                                                                                                                                                                       |
| `interaction`    | Interaction | enum   | no       | `none`, `hovered`, `focused`, `pressed`, `dragged` | `none`   | Still appearance of the interaction state: hovered, focused, pressed or dragged; none = no state layer. Only changes the drawing, does not enter the code. This type has no enabled, so there is no disabled state to win. |
| `width`          | Width       | enum   | no       | `wrap`, `fill`, `fixed`                            | `wrap`   | wrap fits the content, fill takes all the available width and fixed uses the marking width (dp).                                                                                                                           |
| `height`         | Height      | enum   | no       | `wrap`, `fill`, `fixed`                            | `wrap`   | wrap fits the content, fill takes all the available height and fixed uses the marking height (dp).                                                                                                                         |
| `weight`         | Weight      | number | no       |                                                    |          | Share of the leftover space in a Row or Column (Modifier.weight). Empty = no weight.                                                                                                                                       |

## Compose

- Symbol: `androidx.compose.material3.Card`
- File (`path`): `compose/material3/material3/src/commonMain/kotlin/androidx/compose/material3/Card.kt`
- The `style` field chooses the symbol; values without their own case use the base one.

| `style`         | Symbol         |
| --------------- | -------------- |
| `filled` (base) | `Card`         |
| `elevated`      | `ElevatedCard` |
| `outlined`      | `OutlinedCard` |

How the annotation becomes the call (the values below are examples; the parameter names and expressions are those of `params` and `values` in the `code`):

```kotlin
Card(    // style elevated: ElevatedCard, outlined: OutlinedCard
    modifier = Modifier.fillMaxWidth(),
) {
    Column {
        AsyncImage(    // remote media: app loader
            model = "https://example.com/praia.jpg",
            contentDescription = null,
            contentScale = ContentScale.Crop,
            modifier = Modifier.fillMaxWidth(),
        )
        Text("Praia do Rosa")                  // title
        Text("October 12 to 18")               // subtitle
        Text("Sunny weekend.")                 // supportingText
    }
}
```

Notes from the `code` (what the tool hands to the agent):

> The content goes in `content` (a Column): `media` at the top, then `title`, `subtitle` and `supportingText` in `Text`. Remote `media` uses the app's image loader (for example Coil `AsyncImage(model = <media>, contentDescription = null, contentScale = ContentScale.Crop, modifier = Modifier.fillMaxWidth())`), outside androidx. A clickable card uses the overload with `onClick`. Size: `fill` becomes `Modifier.fillMaxWidth()`/`fillMaxHeight()`, `fixed` becomes `Modifier.width(<marking width>.dp)`/`height(<marking height>.dp)` and `weight` becomes `Modifier.weight(<weight>f)` (only inside Row, Column or FlowRow).

## Examples

- **Simple card**: title=Weekly summary, subtitle=October 12 to 18, supportingText=You completed 8 of 10 tasks., style=filled, width=fill
- **With image**: title=Praia do Rosa, supportingText=Sunny weekend., media=https://example.com/praia.jpg, style=elevated, width=fill
- **Outlined**: title=Free plan, style=outlined, width=fill
- **Hovered**: title=Weekly summary, subtitle=October 12 to 18, style=elevated, width=fill, interaction=hovered
- **Focused**: title=Free plan, style=outlined, width=fill, interaction=focused
- **Pressed**: title=Weekly summary, subtitle=October 12 to 18, style=filled, width=fill, interaction=pressed
- **Dragged**: title=Praia do Rosa, supportingText=Sunny weekend., style=elevated, width=fill, interaction=dragged

## Fidelity

Reference: Compose `material3` 1.4.0, commit `5113b82a4ed6416d6344efa50e41db8cb65928ff` (decisions 1 to 3 of the faithful Material 3 stage). 1 dp = 1 component unit; the container density converts to image pixels (`docs/COMPONENT-FORMAT.md`, "Units and density"). Colors, radius and typography come from the specialization tokens (`tokens`, in the `light` and `dark` modes), which mirror the androidx token files; no color, font or radius is literal in the component.

**Files used**

- `compose/material3/material3/src/commonMain/kotlin/androidx/compose/material3/tokens/FilledCardTokens.kt` (lines 24 to 26: `ContainerColor = SurfaceContainerHighest`, `ContainerElevation = Level0`, `ContainerShape = CornerMedium`).
- `compose/material3/material3/src/commonMain/kotlin/androidx/compose/material3/tokens/ElevatedCardTokens.kt` (lines 24 to 26: `SurfaceContainerLow`, `ContainerElevation = Level1`, `CornerMedium`).
- `compose/material3/material3/src/commonMain/kotlin/androidx/compose/material3/tokens/OutlinedCardTokens.kt` (lines 24 to 26: `Surface`, `Level0`, `CornerMedium`; lines 38 and 39: `OutlineColor = OutlineVariant`, `OutlineWidth = 1.0.dp`; the elevations and the outlines per state of the `interaction` field, lines 30 to 41).
- `compose/material3/material3/src/commonMain/kotlin/androidx/compose/material3/Card.kt` (lines 80 to 98: `Card` is a `Surface` with `shape`, `color`, `contentColor`, `shadowElevation` and `border` over a `Column`; lines 370 to 379: `CardDefaults.shape`, `elevatedShape`, `outlinedShape`; lines 486 to 517, 531 to 565 and 580 to 610: `contentColor = contentColorFor(containerColor)`; lines 614 to 624: `outlinedCardBorder`).

**How the drawing follows Compose**

- The radius is `corner-medium` (12) in the three styles.
- `filled` uses `surface-container-highest`, with no shadow and no outline; `elevated` uses `surface-container-low` with the two level 1 shadows (point: `y` 1, `blur` 2; ambient: `y` 1, `blur` 3, `spread` 1; tokens `elevation-1-point-*` and `elevation-1-ambient-*`); `outlined` uses `surface` with a 1 outline in `outline-variant`, on the inside. The values change with the mode (light and dark).
- The content color is the background's `contentColorFor`, `on-surface`: the title uses it. The subtitle and the supporting text use `on-surface-variant`, like the `bodyMedium` of a Material card.
- The title is `title-medium` (16/24, weight 500) and the subtitle and the supporting text are `body-medium` (14/20, weight 400), with the letter spacing from the tokens. No `family`: the font is the theme's `font-sans`.
- The `Surface` clips the content to the shape; the drawing root also clips, so the media at the top gets the card's rounded corners.
- Remote media (the format's `image`) sits on `surface-container-highest` while it does not load; it is the app's image loader (`AsyncImage`) that fetches it, outside androidx.

**Interaction state (`interaction` field)**

The field chooses the still appearance of a state; it does not enter the `code` or the `variants`. The options are `none` and the states that the commit's `*CardTokens.kt` define for the card: `hovered`, `focused`, `pressed` and `dragged`. **This type has no `enabled`**, so there is no disabled state to win: the state always draws.

- **State layer:** the `state` node is a `rect` with the card's shape (`corner-medium`), over the `body` (media and text), like the Compose indicator, with the card's content color, `on-surface` (the background's `contentColorFor`; the `*CardTokens.kt` name no other) and `opacity` from the tokens `state-hover` (0.08), `state-focus` (0.10), `state-pressed` (0.10) and `state-dragged` (0.16), which mirror `compose/material3/material3/src/commonMain/kotlin/androidx/compose/material3/tokens/StateTokens.kt` (lines 22 to 25). For this the body (the column of media and text) became the `body` node, a child of the root, which now stacks layers (`layout: none`); the card size does not change.
- **Elevation per state** (`FilledCardTokens.kt`, `ElevatedCardTokens.kt` and `OutlinedCardTokens.kt`, `*ContainerElevation` lines): filled and outlined go from 0 to level 1 on hover (`HoverContainerElevation`, line 33 on filled and 34 on outlined), stay at 0 on focus and pressed (lines 31 and 36 on filled, 32 and 40 on outlined) and go to level 3 when dragged (`DraggedContainerElevation`, line 30 on both); the elevated goes from 1 (line 25) to level 2 on hover (line 33), stays at 1 on focus and pressed (lines 31 and 36) and goes to level 4 when dragged (line 30). Levels in `ElevationTokens.kt` (`Level1` 1 dp, `Level2` 3 dp, `Level3` 6 dp and `Level4` 8 dp). The shadow's `y` and `blur` accept `$token`, but not an expression (the level does not switch with the state in the same node): level 1 is the root's shadow (y 1, blur 2) and the others are separate nodes, `level 2 shadow` (y 2, blur 6), `level 3 shadow` (y 3, blur 12) and `level 4 shadow` (y 4, blur 16, the values of `elevation-2-*`, `elevation-3-*` and `elevation-4-*`), each with the card's background (and the outline, on outlined), visible only in the state that asks for the level.
- **Outline color** (outlined, `OutlinedCardTokens.kt`): `OutlineColor` (`outline-variant`, line 38) at rest, on hover (`HoverOutlineColor`, line 35), pressed (line 41) and dragged (`DraggedOutlineColor`, line 31); on focus, `on-surface` (`FocusOutlineColor`, line 33). Filled and elevated have no outline.

**What still differs from Compose**

- The shadows read the elevation tokens (`$token` in `shadow`): `elevation-1-point-*` and `elevation-1-ambient-*` on the root and `elevation-N-point-*` and `elevation-N-ambient-*` on the `level N shadow` nodes; changing the token in the specialization reaches the drawing.
- The two shadows (point and ambient) come from the tokens `elevation-1-point-*` and `elevation-1-ambient-*` (`$token` in `shadow`, a list of two shadows with `spread`); the elevation's tonal one is not drawn. Material 3 elevation values for the web: `elevation/internal/_elevation.scss` of `material-components/material-web` (version 2.5.0, commit `37aa14b843dcaeb3a46f898679fa6fcd109b1905`), a source outside Compose, which on Android hands the elevation to the platform and does not carry the numbers: point shadow in black at 30% and ambient shadow in black at 15%, with `y`, `blur` and `spread` per level (tokens `elevation-1-point-*` and `elevation-1-ambient-*`).
- The 16 of spacing between the edges and the text and the 4 gap between the lines belong to the drawing: Compose's `Card` has no padding, whoever writes the `Column` decides. The media has a fixed height of 140.
- No disabled state (the type has no `enabled`) and no `onClick`. The interaction states are still frames: no animated ripple and no transition, and the focus ring only applies to filled and elevated (`FilledCardTokens.kt` and `ElevatedCardTokens.kt`, line 32: `FocusIndicatorColor`; `OutlinedCardTokens.kt` does not define it): with `focused` it draws the 3 ring in `secondary`, offset 2 from the shape (`stroke.offset`), outside the box (the width and the offset are those of the stage decision; the `*Tokens.kt` only carries the color).
- `Card.kt` does not read all the card state tokens: `outlinedCardElevation` (lines 452 to 458) uses the default elevation (0) on hover, focus and pressed, and `outlinedCardBorder` (lines 614 to 623) only distinguishes enabled and disabled, without the focus color. The drawing follows the `OutlinedCardTokens.kt`, as the stage asks, so the outlined rises to level 1 on hover and gets the `on-surface` outline on focus.
