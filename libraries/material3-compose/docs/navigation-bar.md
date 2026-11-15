# Navigation bar

Bottom navigation bar with three to five destinations. Each row of Items is a destination.

Annotation type: `navigation-bar` (Components layer).

## Fields

| Key               | Label             | Type  | Required | Options                                 | Default | Description                                                                                                                                                                                                                                                                        |
| ----------------- | ----------------- | ----- | -------- | --------------------------------------- | ------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `items`           | Items             | table | yes      | see Columns below                       |         | One destination per row, in the order they appear in the bar (three to five).                                                                                                                                                                                                      |
| `alwaysShowLabel` | Always show label | enum  | no       | `true`, `false`                         | `true`  | false shows the label only on the selected destination.                                                                                                                                                                                                                            |
| `interaction`     | Interaction       | enum  | no       | `none`, `hovered`, `focused`, `pressed` | `none`  | Resting look of the selected item's interaction state: hovered, focused or pressed; none = no state layer. It only changes the drawing, it does not go into the code. The type has no disabled state (no enabled): the state always draws. With no selected item, nothing changes. |

Columns of `items` (one row per item):

| Key               | Label            | Type   | Required | Options                                                   | Default |
| ----------------- | ---------------- | ------ | -------- | --------------------------------------------------------- | ------- |
| `label`           | Label            | string | yes      |                                                           |         |
| `icon`            | Icon             | string | no       | free text; icon suggestions (`Home`, `Search`, `Person`…) |         |
| `iconDescription` | Icon description | string | no       | free text                                                 |         |
| `selected`        | Selected         | enum   | no       | `true`, `false`                                           | `false` |

## Compose

- Symbol: `androidx.compose.material3.NavigationBar`
- File (`path`): `compose/material3/material3/src/commonMain/kotlin/androidx/compose/material3/NavigationBar.kt`

How the annotation becomes the call (the values below are examples; the parameter names and the expressions are those of `params` and `values` in `code`):

```kotlin
NavigationBar {
    // a row of items becomes a NavigationBarItem
    NavigationBarItem(
        selected = true,
        onClick = { /* screen logic */ },
        icon = { Icon(Icons.Filled.Home, contentDescription = null) },
        label = { Text("Home") },
        alwaysShowLabel = true,
    )
    NavigationBarItem(
        selected = false,
        onClick = { /* ... */ },
        icon = { Icon(Icons.Filled.Search, contentDescription = null) },
        label = { Text("Search") },
        alwaysShowLabel = true,
    )
}
```

Notes from `code` (what the tool hands to the agent):

> One `NavigationBarItem` per row of `items`, inside `NavigationBar { … }`: `selected`, `onClick`, `icon = { Icon(Icons.Filled.<icon>, contentDescription = null) }`, `label = { Text(<label>) }` and `alwaysShowLabel = <alwaysShowLabel>` (an item parameter, not a bar one). Inside a Scaffold, the bar goes in `bottomBar`. Since material3 1.4.0 the icons require `androidx.compose.material:material-icons-core` (or `-extended`) or a Material Symbol downloaded with `painterResource`; the ones that mirror (ArrowBack, KeyboardArrowRight, List) are in `Icons.AutoMirrored.Filled`.

## Examples

- **Always with label**: alwaysShowLabel=true
- **Label only on the active one**: alwaysShowLabel=false
- **Hovered**: alwaysShowLabel=true, interaction=hovered
- **Focused**: alwaysShowLabel=true, interaction=focused
- **Pressed**: alwaysShowLabel=true, interaction=pressed

## Fidelity

Reference: Compose `material3` 1.4.0, commit `5113b82a4ed6416d6344efa50e41db8cb65928ff` (decisions 1 to 3 of the faithful Material 3 stage). 1 dp = 1 component unit; the container's density converts it to image pixels (`docs/COMPONENT-FORMAT.md`, "Units and density"). The values come from the specialization's tokens (`tokens`, in the `light` and `dark` modes), which mirror the androidx tokens files; no color, font or opacity is left literal in the component.

**Files used**

- `compose/material3/material3/src/commonMain/kotlin/androidx/compose/material3/NavigationBar.kt` (lines 138 to 158: `DefaultNavigationBarOverride`, the `Surface` with a `Row` of `defaultMinSize(minHeight = NavigationBarHeight)` and `Arrangement.spacedBy(NavigationBarItemHorizontalPadding)`; 196 to 316: `NavigationBarItem`, the `weight(1f)`, the label that only appears with `alwaysShowLabel` or when selected; 321 to 329: `NavigationBarDefaults`, `Elevation` Level0 and `containerColor`; 407 to 411: the item colors; 680 to 742: `placeLabelAndIcon`, the icon and label positions; 752 to 772: `NavigationBarHeight`, `NavigationBarItemHorizontalPadding` 8, `NavigationBarIndicatorToLabelPadding` 4, `IndicatorHorizontalPadding` and `IndicatorVerticalPadding`).
- `compose/material3/material3/src/commonMain/kotlin/androidx/compose/material3/tokens/NavigationBarTokens.kt` (lines 24 to 38: `ContainerColor` surface container, `ItemActiveIconColor`, `ItemActiveIndicatorColor`, `ItemActiveIndicatorShape` full, `ItemActiveLabelTextColor` secondary, `ItemInactive*` on surface variant, `NavShape` none, `TallContainerHeight` 80, `LabelTextFont` label medium).
- `compose/material3/material3/src/commonMain/kotlin/androidx/compose/material3/tokens/NavigationBarVerticalItemTokens.kt` (lines 24 to 27: `ActiveIndicatorHeight` 32, `ActiveIndicatorWidth` 56, `IconSize` 24).
- `compose/material3/material3/src/commonMain/kotlin/androidx/compose/material3/NavigationBar.kt` (lines 102 to 115: `contentColor` = `contentColorFor(containerColor)`; 272 to 294: the state layer only appears on the indicator, `indicatorRipple` with a `ripple()` clipped to `ItemActiveIndicatorShape`).
- `compose/material3/material3/src/commonMain/kotlin/androidx/compose/material3/tokens/NavigationBarTokens.kt` (lines 24 to 38: does not define the item's state color or opacity).
- `compose/material3/material3/src/commonMain/kotlin/androidx/compose/material3/tokens/StateTokens.kt` (lines 22 to 25: `HoverStateLayerOpacity`, `FocusStateLayerOpacity`, `PressedStateLayerOpacity`; `DraggedStateLayerOpacity` 0.16 is the `state-dragged`).

**How the drawing follows Compose**

- Container of 80 (`TallContainerHeight`, the row's `defaultMinSize`) in `surface-container`, with no corner and no shadow (the composable's default elevation is Level0, not the Level2 of the tokens file).
- The destinations have the same width (`weight(1f)`), with 8 between them and no margin at the ends: the `repeat` with `distribute: "fill"` and `gap` 8.
- Indicator of the selected one of 56 × 32 (`IndicatorHorizontalPadding` 16 and `IndicatorVerticalPadding` 4 around the 24 icon) in the `corner-full` shape, in `secondary-container`; the unselected one paints no background. The 24 icon (`icon` node) sits at the center of the indicator: `on-secondary-container` when selected, `on-surface-variant` on the others.
- With a label, the content is the indicator (12 from the top), 4 of space and the label in `label-medium` (12 / 16, weight 500, 0.5 letter spacing): `secondary` when selected, `on-surface-variant` on the others. With `alwaysShowLabel` false the label disappears on the unselected ones and the icon moves down to the center of the height (`unselectedIconY = (height - icon) / 2`, 28); the content position changes with the `justify` and the `padding` by expression.
- One-line label centered by the cap height (`cap-middle`): the `label` node uses `font.verticalAlign: "cap-middle"` and stays `hug` in height, because the parent also measures by the text; the text box is the line, centered in the parent. Compose's `Text` centers by the font's line box (ascent and descent); the drawing centers the cap height in the box, and with Roboto the two coincide to within 1 px.

**Interaction state (the `interaction` field)**

The field chooses the resting look of a state; it does not go into the `code` or the `variants`. The options are `none`, `hovered`, `focused` and `pressed`: `NavigationBarTokens.kt` **does not name** item states, but `NavigationBarItem` draws the layer through the Material ripple (`StateTokens.kt`), and these three states are the ones the ripple has. **This type has no `enabled`**, so there is no disabled state that wins: the state always draws.

- **State layer:** the `state` node is a `rect` the size of the indicator (56 × 32) with a `corner-full` radius, on top of it (Compose's ripple is clipped only to the indicator, not to the whole destination), in the color of the ripple with no color of its own, which is the bar's `contentColor`, `on-surface`. The opacity comes from the tokens `state-hover` (0.08), `state-focus` (0.10) and `state-pressed` (0.10). It is not a frame that an item token defines: it is what Compose's ripple paints at rest.
- **State item:** it applies to the selected item (decision 6 of the stage); with no item selected nothing changes. Compose draws the state on the item that the mouse, the focus or the touch reaches; choosing "the first" would require the item index in the `repeat` (#897), and an item index field is left out. The state examples carry the `preview`'s `items`: in the Catalog the example draws the destinations, with the state layer on the selected item.

**What still differs from Compose**

- The Compose 1.4.0 indicator measures 56 × 32 (`NavigationBarVerticalItemTokens.ActiveIndicatorWidth`), and not the 64 × 32 of the first version of this component nor those of the earlier M3 drawing: the drawing follows the `.kt`.
- The `interaction` is a resting frame: no animated ripple, no indicator expansion animation (the drawing is the final state) and no focus ring (Compose does not define `FocusIndicatorColor` for it in the pinned commit); no `enabled` (it is not a field of the type).
- `containerColor`, `contentColor` and `tonalElevation` are fields and code, but the drawing does not use them; `windowInsets` and custom `NavigationBarItemColors` are not fields of the type; the icon is only the name from the library's Material Icons set.
- Compose's label wraps onto more than one line when it goes past the destination's width; here it is `hug` and the drawing check warns about what does not fit.

**Accessibility** (stage #1081; the unit is the dp, 1 dp = 1 component unit): the type has `accessibility.role` `navigation`, with no `label`, and one `item` part per row of `items` with role `tab`, named by the `label` and the `iconDescription` columns of the row (the second one is optional). Compose gives each item `compose/material3/material3/src/commonMain/kotlin/androidx/compose/material3/NavigationBar.kt` (line 250: `Role.Tab`).
