# Navigation rail

Side navigation bar for wide screens. The narrow rail (rail), the wide (wide) and the modal wide (modal-wide) have one destination per row of Items.

Annotation type: `navigation-rail` (Components layer).

## Fields

| Key               | Label             | Type  | Required | Options                                 | Default    | Description                                                                                                                                                                                                                                                                        |
| ----------------- | ----------------- | ----- | -------- | --------------------------------------- | ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `items`           | Items             | table | yes      | see Columns below                       |            | One destination per row, in the order they appear in the rail, from top to bottom.                                                                                                                                                                                                 |
| `style`           | Style             | enum  | no       | `rail`, `wide`, `modal-wide`            | `rail`     | rail (NavigationRail, 80 wide), wide (WideNavigationRail, collapsed or expanded) or modal-wide (ModalWideNavigationRail, which expands over the screen).                                                                                                                           |
| `initialValue`    | Initial state     | enum  | no       | `Collapsed`, `Expanded`                 | `Expanded` | Only for wide and modal-wide: Expanded shows the icon beside the label; Collapsed, the icon above it (rememberWideNavigationRailState).                                                                                                                                            |
| `alwaysShowLabel` | Always show label | enum  | no       | `true`, `false`                         | `true`     | Only for rail: false shows the label only on the selected destination.                                                                                                                                                                                                             |
| `interaction`     | Interaction       | enum  | no       | `none`, `hovered`, `focused`, `pressed` | `none`     | Resting look of the selected item's interaction state: hovered, focused or pressed; none = no state layer. It only changes the drawing, it does not go into the code. The type has no disabled state (no enabled): the state always draws. With no selected item, nothing changes. |

Columns of `items` (one row per item):

| Key        | Label    | Type   | Required | Options                                                   | Default |
| ---------- | -------- | ------ | -------- | --------------------------------------------------------- | ------- |
| `label`    | Label    | string | yes      |                                                           |         |
| `icon`     | Icon     | string | no       | free text; icon suggestions (`Home`, `Search`, `Person`…) |         |
| `selected` | Selected | enum   | no       | `true`, `false`                                           | `false` |

## Compose

- Symbol: `androidx.compose.material3.NavigationRail`
- File (`path`): `compose/material3/material3/src/commonMain/kotlin/androidx/compose/material3/NavigationRail.kt`
- The `style` field chooses the symbol; values without a case of their own use the base one.

| `style`       | Symbol                                                                                   |
| ------------- | ---------------------------------------------------------------------------------------- |
| `rail` (base) | `NavigationRail` (items `NavigationRailItem`)                                            |
| `wide`        | `WideNavigationRail` (file `WideNavigationRail.kt`; items `WideNavigationRailItem`)      |
| `modal-wide`  | `ModalWideNavigationRail` (file `WideNavigationRail.kt`; items `WideNavigationRailItem`) |

How the annotation becomes the call (the values below are examples; the parameter names and the expressions are those of `params` and `values` in `code`):

```kotlin
// style rail
NavigationRail {
    NavigationRailItem(    // one per row of items
        selected = true,
        onClick = { /* screen logic */ },
        icon = { Icon(Icons.Filled.Home, contentDescription = null) },
        label = { Text("Home") },
        alwaysShowLabel = true,
    )
}

// style wide (modal-wide: ModalWideNavigationRail, same parameters)
val state = rememberWideNavigationRailState(initialValue = WideNavigationRailValue.Expanded)
WideNavigationRail(state = state) {
    WideNavigationRailItem(    // one per row of items
        selected = true,
        onClick = { /* screen logic */ },
        icon = { Icon(Icons.Filled.Home, contentDescription = null) },
        label = { Text("Home") },
        railExpanded = state.targetValue == WideNavigationRailValue.Expanded,
    )
}
```

Notes from `code` (what the tool hands to the agent):

> Stable, no opt-in. One `NavigationRailItem` per row of `items`, inside `NavigationRail { … }`: `selected = <selected>`, `onClick = { /* screen logic */ }`, `icon = { Icon(Icons.Filled.<icon>, contentDescription = null) }`, `label = { Text(<label>) }` and `alwaysShowLabel = <alwaysShowLabel>` (an item parameter, not a rail one). The rail's `header = { … }` slot (a FAB or the menu button) is not a field. The minimum width is 80 dp, coming from the composable; the height fills the screen (`fillMaxHeight`). The Scaffold has no slot for the rail: it goes in a `Row` before the content, inside `content = { innerPadding -> Row(Modifier.padding(innerPadding)) { rail; Box(Modifier.weight(1f)) { … } } }`. Since material3 1.4.0 the icons require `androidx.compose.material:material-icons-core` (or `-extended`) or a Material Symbol downloaded with `painterResource`; the ones that mirror (ArrowBack, KeyboardArrowRight, List) are in `Icons.AutoMirrored.Filled`.

Variant `wide`: Stable, no opt-in. `WideNavigationRail(state = rememberWideNavigationRailState(initialValue = <initialValue>)) { … }` (`initialValue` is a parameter of `rememberWideNavigationRailState`; the composable reads the same `state`). One `WideNavigationRailItem` per row of `items`: `selected = <selected>`, `onClick = { /* screen logic */ }`, `icon = { Icon(Icons.Filled.<icon>, contentDescription = null) }`, `label = { Text(<label>) }` and `railExpanded = state.targetValue == WideNavigationRailValue.Expanded` (required and the same on all items; the item's `iconPosition` follows: beside the label when expanded, above it when collapsed). The `label` is nullable. `alwaysShowLabel` does not exist here. The `header = { … }` slot is not a field. The collapsed rail is 96 dp wide and the expanded one from 220 to 360 dp, coming from the composable. Outside the Scaffold: it goes in a `Row` before the content, inside `content = { innerPadding -> … }`. Since material3 1.4.0 the icons require `androidx.compose.material:material-icons-core` (or `-extended`) or a Material Symbol downloaded with `painterResource`; the ones that mirror (ArrowBack, KeyboardArrowRight, List) are in `Icons.AutoMirrored.Filled`.

Variant `modal-wide`: Stable, no opt-in. `ModalWideNavigationRail(state = rememberWideNavigationRailState(initialValue = <initialValue>)) { … }`: collapsed, it stays in place like the wide; expanded, it opens in a modal window over the screen, with a scrim; the `state` expands and collapses it (`expand()`, `collapse()` and `toggle()`, in a coroutine), and `hideOnCollapse = true` makes the rail leave the screen when it collapses. One `WideNavigationRailItem` per row of `items`: `selected = <selected>`, `onClick = { /* screen logic */ }`, `icon = { Icon(Icons.Filled.<icon>, contentDescription = null) }`, `label = { Text(<label>) }` and `railExpanded = state.targetValue == WideNavigationRailValue.Expanded` (required and the same on all items; the item's `iconPosition` follows: beside the label when expanded, above it when collapsed). The `label` is nullable. The `header = { … }` slot is not a field. It sits beside the content, in a `Row` before it, inside the Scaffold's `content = { innerPadding -> … }`; the `Scaffold` has no slot for it. Since material3 1.4.0 the icons require `androidx.compose.material:material-icons-core` (or `-extended`) or a Material Symbol downloaded with `painterResource`; the ones that mirror (ArrowBack, KeyboardArrowRight, List) are in `Icons.AutoMirrored.Filled`.

## Examples

- **Narrow rail**: style=rail, alwaysShowLabel=true
- **Expanded wide**: style=wide, initialValue=Expanded
- **Expanded modal**: style=modal-wide, initialValue=Expanded
- **Hovered**: style=rail, alwaysShowLabel=true, interaction=hovered
- **Focused**: style=rail, alwaysShowLabel=true, interaction=focused
- **Pressed**: style=rail, alwaysShowLabel=true, interaction=pressed

## Fidelity

Reference: Compose `material3` 1.4.0, commit `5113b82a4ed6416d6344efa50e41db8cb65928ff` (decisions 1 to 3 of the faithful Material 3 stage). 1 dp = 1 component unit; the container's density converts it to image pixels (`docs/COMPONENT-FORMAT.md`, "Units and density"). The values come from the specialization's tokens (`tokens`, in the `light` and `dark` modes), which mirror the androidx tokens files; no color, font or opacity is left literal in the component.

**Files used**

- `compose/material3/material3/src/commonMain/kotlin/androidx/compose/material3/NavigationRail.kt` (lines 146 to 168: `DefaultNavigationRailOverride`, the `Surface` with a `Column` of `widthIn(min = 80)`, `padding(vertical = 4)` and `spacedBy(4)`; 200 to 316: `NavigationRailItem`, `defaultMinSize(minHeight = 56)` and `widthIn(min = 80)`; 327 to 332: `containerColor`; 693 to 753: `placeLabelAndIcon`; 767 to 797: the inset and size constants).
- `compose/material3/material3/src/commonMain/kotlin/androidx/compose/material3/WideNavigationRail.kt` (lines 209 to 415: `WideNavigationRailLayout`; 230 to 252: the minimum width 96 or 220, the space between items 4 or 0 and the minimum item height 64 or 48; 264: the top of 44; 317 to 336: the measuring of the items (`fitPrioritizingWidth`) and the rail width by the widest item plus 20; 410: the items' position; 788 to 814: `WideNavigationRailDefaults`, the shapes; 855 to 860: `containerColor` and `modalContainerColor`; 993 to 1000: the `Surface` of the expanded modal rail; 1135 to 1157: `ItemHorizontalPadding` 20, `WNRVerticalPadding` 44, `CollapsedRailWidth`, `ExpandedRailMinWidth` 220, `ExpandedRailMaxWidth` 360, `TopIconItemMinHeight` 64).
- `compose/material3/material3/src/commonMain/kotlin/androidx/compose/material3/NavigationItem.kt` (lines 895 to 975: `placeLabelAndTopIcon`; 978 to 1075: `placeAnimatedLabelAndIcon`, the wide rail's item: indicator at the top, icon at 4, label at 36; the pill with the icon beside the label at 20 from the edge, with the icon 16 from the start and 8 up to the label).
- `compose/material3/material3/src/commonMain/kotlin/androidx/compose/material3/tokens/`: `NavigationRailCollapsedTokens.kt` (24 to 31: width 96, 80 narrow, `TopSpace` 44, `ItemVerticalSpace` 4, color surface), `NavigationRailExpandedTokens.kt` (24 to 32: width 220 to 360, `ModalContainerShape` CornerLarge, `ModalContainerColor` surface container), `NavigationRailVerticalItemTokens.kt` (24 to 30: indicator 56 × 32, `IconLabelSpace` 4, label medium), `NavigationRailHorizontalItemTokens.kt` (24 to 30: indicator of 56 height, `IconLabelSpace` 8, label large), `NavigationRailBaselineItemTokens.kt` (24 to 32: `ContainerHeight` 64, `IconSize` 24) and `NavigationRailColorTokens.kt` (24 to 31: icon `on-secondary-container`, indicator `secondary-container`, label `secondary` or `on-surface-variant`).
- `compose/material3/material3/src/commonMain/kotlin/androidx/compose/material3/NavigationRail.kt` (lines 112 to 123: `contentColor`; 274 to 302: the state layer only on the indicator, the narrow rail item's `ripple()`) and `NavigationItem.kt` (lines 1102 to 1108: the same `IndicatorRipple` of the wide items).
- `compose/material3/material3/src/commonMain/kotlin/androidx/compose/material3/tokens/StateTokens.kt` (lines 22 to 25: `HoverStateLayerOpacity`, `FocusStateLayerOpacity`, `PressedStateLayerOpacity`; `DraggedStateLayerOpacity` 0.16 is the `state-dragged`).

**How the drawing follows Compose**

- Narrow rail (`style: rail`): sheet of 80 in `surface`, 4 of vertical padding, destinations of 56 with 4 between them. In the destination, the 56 × 32 indicator in `corner-full` sits at the top, the 24 icon at 4 from it and the label in `label-medium` at 36 (4 of space after the indicator). With `alwaysShowLabel` false the label disappears on the unselected ones and the icon stays at the center of the 56 (y = 16).
- Collapsed wide: sheet of 96 in `surface`, 44 at the top, destinations of 64 with 4 between them, the 56 × 32 indicator at 20 from the edge and the content (indicator, icon, label in `label-medium`) at the top of the item.
- Expanded wide: width of at least 220 and at most 360, which grows with the widest pill plus 20 (`hug` with `minWidth` and `maxWidth`); items of 56 with no space between them; the 56-high pill in `corner-full` sits at 20 from the edge and measures `16 + 24 icon + 8 + label + 16`, with the label in `label-large` (14 / 20, weight 500, 0.1).
- Expanded modal: `surface-container` with all four corners of 16 (`corner-large`); collapsed, the same as the collapsed wide. Colors as in Compose: icon `on-secondary-container` when selected and `on-surface-variant` on the others, label `secondary` when selected, indicator `secondary-container`.
- Label centered by the cap height (`cap-middle`): the `label` node uses `font.verticalAlign: "cap-middle"`; in the expanded destination (icon beside) it takes the height of the `content` frame (`height: "fill"`) and, with the icon above, stays `hug` in a column. Compose's `Text` centers by the font's line box (ascent and descent); the drawing centers the cap height in the box, and with Roboto the two coincide to within 1 px.

**Interaction state (the `interaction` field)**

The field chooses the resting look of a state; it does not go into the `code` or the `variants`. The options are `none`, `hovered`, `focused` and `pressed`: the rail tokens **do not name** item states; the layer is the indicator's ripple (`StateTokens.kt`). **This type has no `enabled`**, so there is no disabled state that wins: the state always draws.

- **State layer:** the `state` node is a `rect` the size of the style's indicator (56 × 32 under the icon in the rail and the collapsed wide, the 56-high pill in the expanded wide and the modal), on top of it and with the `corner-full` radius, in the color of the ripple with no color of its own, the sheet's `contentColor`, `on-surface`. The opacity comes from the tokens `state-hover` (0.08), `state-focus` (0.10) and `state-pressed` (0.10).
- **State item:** it applies to the selected item (decision 6 of the stage); with no item selected nothing changes. Compose draws the state on the item that the mouse, the focus or the touch reaches; choosing "the first" would require the item index in the `repeat` (#897), and an item index field is left out. The state examples carry the `preview`'s `items`: in the Catalog the example draws the destinations, with the state layer on the selected item.

**What still differs from Compose**

- The scrim, the modal rail's elevation (Level2 in the tokens, no shadow in the composable), the expand and collapse animation, the header (`header`) and the rail button are not part of the drawing; the `modal-wide` style draws only the sheet.
- The narrow rail's width is `hug` with a minimum of 80 (Compose's `widthIn(min = 80)`); the collapsed wide is capped at 96 even with a wider label, like Compose's `actualMinWidth`.
- The `interaction` is a resting frame: no animated ripple or focus ring (Compose does not define `FocusIndicatorColor` for it in the pinned commit), no `enabled` and no icon-only item (an item with no label, with a round 56 × 56 indicator): the type requires the label.
