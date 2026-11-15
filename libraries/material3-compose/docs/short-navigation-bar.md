# Short navigation bar

Short bottom navigation bar with three to six destinations. Each row of Items is a destination; the icon sits above or beside the label.

Annotation type: `short-navigation-bar` (layer Components).

## Fields

| Key            | Label         | Type  | Required | Options                                 | Default       | Description                                                                                                                                                                                                                                                                                      |
| -------------- | ------------- | ----- | -------- | --------------------------------------- | ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `items`        | Items         | table | yes      | see Columns below                       |               | One destination per row, in the order they appear in the bar (three to five with the icon on top; up to six with the icon beside).                                                                                                                                                               |
| `arrangement`  | Arrangement   | enum  | no       | `EqualWeight`, `Centered`               | `EqualWeight` | EqualWeight splits the width equally (narrow screens); Centered groups the items in the middle (medium screens; the drawing takes 60%, 70%, 80% or 90% of the width with 3, 4, 5 or 6 items, and each item grows up to width/items when the content is larger).                                  |
| `iconPosition` | Icon position | enum  | no       | `Top`, `Start`                          | `Top`         | Top puts the icon above the label; Start puts the icon beside it (an item parameter, the same in all of them).                                                                                                                                                                                   |
| `interaction`  | Interaction   | enum  | no       | `none`, `hovered`, `focused`, `pressed` | `none`        | Resting appearance of the interaction state of the selected item: hovered, focused or pressed; none = no state layer. It only changes the drawing and does not go into the code. The type has no disabled state (no enabled): the state is always drawn. With no selected item, nothing changes. |

Columns of `items` (one row per item):

| Key               | Label            | Type   | Required | Options                                                   | Default |
| ----------------- | ---------------- | ------ | -------- | --------------------------------------------------------- | ------- |
| `label`           | Label            | string | yes      |                                                           |         |
| `icon`            | Icon             | string | no       | free text; icon suggestions (`Home`, `Search`, `Person`…) |         |
| `iconDescription` | Icon description | string | no       | free text                                                 |         |
| `selected`        | Selected         | enum   | no       | `true`, `false`                                           | `false` |

## Compose

- Symbol: `androidx.compose.material3.ShortNavigationBar`
- File (`path`): `compose/material3/material3/src/commonMain/kotlin/androidx/compose/material3/ShortNavigationBar.kt`

How the annotation becomes the call (the values below are examples; the parameter names and expressions are those of `params` and `values` in `code`):

```kotlin
ShortNavigationBar(arrangement = ShortNavigationBarArrangement.EqualWeight) {
    // a row of items becomes a ShortNavigationBarItem
    ShortNavigationBarItem(
        selected = true,
        onClick = { /* screen logic */ },
        icon = { Icon(Icons.Filled.Home, contentDescription = null) },
        label = { Text("Home") },
        iconPosition = NavigationItemIconPosition.Top,    // the same in all items
    )
    ShortNavigationBarItem(
        selected = false,
        onClick = { /* ... */ },
        icon = { Icon(Icons.Filled.Search, contentDescription = null) },
        label = { Text("Search") },
        iconPosition = NavigationItemIconPosition.Top,
    )
}
```

`code` notes (what the tool hands to the agent):

> Stable, no opt-in. One `ShortNavigationBarItem` per row of `items`, inside `ShortNavigationBar(arrangement = <arrangement>) { … }`: `selected = <selected>`, `onClick = { /* screen logic */ }`, `icon = { Icon(Icons.Filled.<icon>, contentDescription = null) }`, `label = { Text(<label>) }` (the `label` is nullable, but the bar always shows the label), and `iconPosition = <iconPosition>` (an item parameter, not a bar one: repeat the value in all of them). Inside a Scaffold, the bar goes in `bottomBar`. The minimum height is 64 dp, coming from the composable; the width is the screen width. Since material3 1.4.0 the icons require `androidx.compose.material:material-icons-core` (or `-extended`) or a Material Symbol downloaded with `painterResource`; the ones that mirror (ArrowBack, KeyboardArrowRight, List) are in `Icons.AutoMirrored.Filled`.

## Examples

- **Icon above, distributed**: arrangement=EqualWeight, iconPosition=Top
- **Icon beside, centered**: arrangement=Centered, iconPosition=Start
- **Icon above, centered**: arrangement=Centered, iconPosition=Top
- **Hovered**: arrangement=EqualWeight, iconPosition=Top, interaction=hovered
- **Focused**: arrangement=EqualWeight, iconPosition=Top, interaction=focused
- **Pressed**: arrangement=EqualWeight, iconPosition=Top, interaction=pressed

## Fidelity

Reference: Compose `material3` 1.4.0, commit `5113b82a4ed6416d6344efa50e41db8cb65928ff` (decisions 1 to 3 of the faithful Material 3 stage). 1 dp = 1 component unit; the container density converts it to image pixels (`docs/COMPONENT-FORMAT.md`, "Units and density"). The values come from the specialization tokens (`tokens`, in the `light` and `dark` modes), which mirror the androidx token files; no color, font or opacity is literal in the component.

**Files used**

- `compose/material3/material3/src/commonMain/kotlin/androidx/compose/material3/ShortNavigationBar.kt` (lines 121 to 146: `DefaultShortNavigationBarOverride`, the `Surface` with `defaultMinSize(minHeight = NavigationBarTokens.ContainerHeight)` and the choice between `EqualWeight` and `Centered`; 210 to 256: `ShortNavigationBarItem` and the indicator insets by `iconPosition`; 263 and 305 to 309: container and item color; 384 to 434: `EqualWeightContentMeasurePolicy`, the width split equally; 436 to 499: `CenteredContentMeasurePolicy`; 501 to 518: `calculateCenteredContentHorizontalPadding` (items take 60%, 70%, 80% and 90% of the width with 3 to 6 items); 521 to 540: `TopIconItemVerticalPadding` 6, the indicator insets and `StartIconToLabelPadding` 4).
- `compose/material3/material3/src/commonMain/kotlin/androidx/compose/material3/NavigationItem.kt` (lines 553 to 645: `TopIconOrIconOnlyMeasurePolicy`; 647 to 735: `StartIconMeasurePolicy`; 895 to 975: `placeLabelAndTopIcon` and `placeLabelAndStartIcon`, the positions of the icon, the label and the indicator).
- `compose/material3/material3/src/commonMain/kotlin/androidx/compose/material3/tokens/NavigationBarTokens.kt` (lines 24 to 38) and `NavigationBarVerticalItemTokens.kt` (24 to 27: indicator 56 × 32, `ContainerBetweenSpace` 6) and `NavigationBarHorizontalItemTokens.kt` (24 to 27: `ActiveIndicatorHeight` 40, `ActiveIndicatorLeadingSpace` and `TrailingSpace` 16).
- `compose/material3/material3/src/commonMain/kotlin/androidx/compose/material3/NavigationItem.kt` (lines 1102 to 1108: `IndicatorRipple`, a `ripple()` clipped to the indicator shape) and `ShortNavigationBar.kt` (lines 265 to 267: `contentColor` = `contentColorFor(containerColor)`).
- `compose/material3/material3/src/commonMain/kotlin/androidx/compose/material3/tokens/StateTokens.kt` (lines 22 to 25: `HoverStateLayerOpacity`, `FocusStateLayerOpacity`, `PressedStateLayerOpacity`; `DraggedStateLayerOpacity` 0.16 is the `state-dragged`).

**How the drawing follows Compose**

- Container 64 (`NavigationBarTokens.ContainerHeight`) in `surface-container`, no shadow.
- `EqualWeight`: the destinations split the width equally (`ShortNavigationBar.kt` 384 to 434, `EqualWeightContentMeasurePolicy`), with no space between them: each destination measures `width / items` (equal `minWidth` and `maxWidth`, through `$size` and `$rows`).
- `Centered`: the destinations are grouped in the middle, with equal margins on both sides, computed (`$size` and `$rows`), like `CenteredContentMeasurePolicy` (`ShortNavigationBar.kt` 436 to 499). The margin on each side is `width × (0.35 − 0.05 × items)`, which is `calculateCenteredContentHorizontalPadding` (501 to 518, `((100 − 10 × (items + 3)) / 2) / 100` of the width): 20% with 3 items, 15% with 4, 10% with 5 and 5% with 6, and none with more than 6 (`if (itemsCount > 6) return 0`, 514). Each destination starts with the slice `(width − 2 × margin) / items` (`itemMinWidth`, 461) and grows up to the width the content asks for, at most `width / items` (`itemMaxWidth`, 459; 473 to 477); the margins shrink by half of what each destination grew (479) and the group stays in the center (491). In the drawing the slice is the destination `minWidth`, `width / items` the `maxWidth` and the two margins split what is left equally, so the margin and growth computation comes from the same two measures, `{ "$size": "width" }` and `{ "$rows": "items" }`.
- Icon on top: 64 item with 6 inset (`topIconItemVerticalPadding`), 56 × 32 indicator in `corner-full`, 24 icon in its center, 4 of space and the label in `label-medium` (12 / 16, weight 500, 0.5): the content measures 6 + 32 + 4 + 16 + 6 = 64.
- Icon beside: pill 40 high (24 for the icon plus 8 above and below) in `corner-full`, with 16 of room on the sides and 4 between icon and label, centered in the height. The label uses `label-medium` here too (`NavigationBarTokens.LabelTextFont`).
- Colors: indicator `secondary-container` (only on the selected one), icon `on-secondary-container` when selected and `on-surface-variant` on the others, label `secondary` when selected and `on-surface-variant` on the others.
- Label centered by the cap height (`cap-middle`): the `label` node uses `font.verticalAlign: "cap-middle"`; with the icon beside it takes the pill height (`height: "fill"`) and, with the icon on top, stays `hug` in a column. The Compose `Text` centers by the font line box (ascent and descent); the drawing centers the cap height in the box, and with Roboto the two coincide to within 1 px.

**Interaction state (`interaction` field)**

The field chooses the resting appearance of a state; it does not go into the `code` or the `variants`. The options are `none`, `hovered`, `focused` and `pressed`: `NavigationBarTokens.kt` and `NavigationItem.kt` **do not name** item states; the layer is the indicator ripple (`StateTokens.kt`). **This type has no `enabled`**, so there is no disabled state that wins: the state is always drawn.

- **State layer:** the `state` node is a `rect` the size of the indicator, on top of it and with the `corner-full` radius — the 56 × 32 one of the icon above the label, or the 40 pill of the icon beside it —, in the color of the ripple with no color of its own, the bar `contentColor`, `on-surface`. The opacity comes from the `state-hover` (0.08), `state-focus` (0.10) and `state-pressed` (0.10) tokens.
- **Item of the state:** it applies to the selected item (decision 6 of the stage); with no selected item nothing changes. Compose draws the state on the item that the mouse, focus or touch reaches; choosing "the first one" would need the item index in the `repeat` (#897), and an item index field is out of scope. The state examples carry the `items` of the `preview`: in the Catalog the example draws the destinations, with the state layer on the selected item.

**What still differs from Compose**

- The drawing does not round the margin or the widths to whole pixels: Compose uses integer division and `roundToInt()` (`ShortNavigationBar.kt` 461 and 517), so the margin can differ by up to 1 px (the one for 5 items at 412 wide is 41.2 here and 41 there).
- The width the item asks for is that of the content the drawing measures (the 56 indicator or the widest label, with the icon on top; the 40 pill with the icon beside), not the `maxIntrinsicWidth` of the `ShortNavigationBarItem` (473): with long labels the point where the item stops growing can differ. With the icon beside and 5 or 6 items the pill is wider than `width / items`: the item stops at that ceiling and the pill overflows it, with the "content larger than the box" warning (the drawing neither clips nor abbreviates the label).
- The `interaction` is a still frame: no animated ripple, no indicator animation (the drawing is the final state), no focus ring (Compose does not define `FocusIndicatorColor` for it at the pinned commit) and no `enabled`.
- The item's 48 minimum touch height and `windowInsets` do not appear in the drawing; a custom `ShortNavigationBarItemColors` is not a field of the type.
