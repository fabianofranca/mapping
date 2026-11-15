# Tabs

Row of tabs to switch between views of the same level. Primary sits under the top bar; Secondary separates content within an area; the scrollable ones accept more tabs than fit. Each row of Tabs is a tab.

Annotation type: `tabs` (layer Components).

## Fields

| Key            | Label         | Type  | Required | Options                                                              | Default   | Description                                                                                                                                                                                                                                                                                      |
| -------------- | ------------- | ----- | -------- | -------------------------------------------------------------------- | --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `items`        | Tabs          | table | yes      | see Columns below                                                    |           | One tab per row, in the order they appear; only one with Selected = true.                                                                                                                                                                                                                        |
| `style`        | Style         | enum  | no       | `primary`, `secondary`, `primary-scrollable`, `secondary-scrollable` | `primary` | primary (3 indicator at the label size), secondary (3 indicator at the tab width) or the scrollable version of each (tabs with the content width, at least 90, and an initial inset of 52).                                                                                                      |
| `iconPosition` | Icon position | enum  | no       | `top`, `leading`                                                     | `top`     | top (Tab) puts the icon above the text, and the row goes from 48 to 72; leading (LeadingIconTab) puts the icon to the left of the text, at 48. Only applies to tabs with icon and text.                                                                                                          |
| `interaction`  | Interaction   | enum  | no       | `none`, `hovered`, `focused`, `pressed`                              | `none`    | Resting appearance of the interaction state of the selected item: hovered, focused or pressed; none = no state layer. It only changes the drawing and does not go into the code. The type has no disabled state (no enabled): the state is always drawn. With no selected item, nothing changes. |

Columns of `items` (one row per tab):

| Key        | Label    | Type   | Required | Options                                                   | Default |
| ---------- | -------- | ------ | -------- | --------------------------------------------------------- | ------- |
| `label`    | Label    | string | yes      |                                                           |         |
| `icon`     | Icon     | string | no       | free text; icon suggestions (`Home`, `Search`, `Person`…) |         |
| `selected` | Selected | enum   | no       | `true`, `false`                                           | `false` |

## Compose

- Symbol: `androidx.compose.material3.PrimaryTabRow`
- File (`path`): `compose/material3/material3/src/commonMain/kotlin/androidx/compose/material3/TabRow.kt`
- The `style` field chooses the symbol; values without their own case use the base one.

| `style`                | Symbol                      |
| ---------------------- | --------------------------- |
| `primary` (base)       | `PrimaryTabRow`             |
| `secondary`            | `SecondaryTabRow`           |
| `primary-scrollable`   | `PrimaryScrollableTabRow`   |
| `secondary-scrollable` | `SecondaryScrollableTabRow` |

The tab itself does not depend on the style, but on `iconPosition`: `top` (or a tab without an icon) is `Tab`, and `leading` is `LeadingIconTab`, both in `Tab.kt`.

How the annotation becomes the call (the values below are examples; the parameter names and expressions are those of `params` and `values` in `code`):

```kotlin
PrimaryTabRow(selectedTabIndex = 0) {    // style secondary: SecondaryTabRow, primary-scrollable: PrimaryScrollableTabRow…
    // a row of items becomes a Tab (iconPosition top)
    Tab(
        selected = true,
        onClick = { /* screen logic */ },
        text = { Text("Home") },
        icon = { Icon(Icons.Filled.Home, contentDescription = null) },
    )
    Tab(
        selected = false,
        onClick = { /* ... */ },
        text = { Text("Search") },
        icon = { Icon(Icons.Filled.Search, contentDescription = null) },
    )
    // iconPosition leading: LeadingIconTab(selected, onClick, text = { … }, icon = { … })
}
```

`code` notes (what the tool hands to the agent):

> The row is `PrimaryTabRow(selectedTabIndex = <index of the row of items with selected = true>) { … }` (`style` chooses the row). Inside, one tab per row of `items`: with `iconPosition = top` (or no icon), `Tab(selected = <selected>, onClick = …, text = { Text(<label>) }, icon = { Icon(Icons.Filled.<icon>, contentDescription = null) })` (omit `icon` when the column is empty); with `iconPosition = leading`, `LeadingIconTab(selected, onClick, text = { Text(<label>) }, icon = { Icon(…) })`, which requires `text` and `icon`. `Tab` and `LeadingIconTab` are in `Tab.kt`, in the same package, and come from `androidx.compose.material3`. `TabRow` and `ScrollableTabRow` are `@Deprecated` (replaced by the four rows): do not use them. The four rows and the two tabs are stable, no opt-in. The fixed row splits the width equally; the scrollable ones (`edgePadding` 52, `minTabWidth` 90, `scrollState`) leave each tab at the content width. Width and position come from the `Modifier` (the row has no size of its own; it usually goes under the `TopAppBar` or above the page content). Since material3 1.4.0 the icons require `androidx.compose.material:material-icons-core` (or `-extended`) or a Material Symbol downloaded with `painterResource`; the ones that mirror (ArrowBack, KeyboardArrowRight, List) are in `Icons.AutoMirrored.Filled`.

## Examples

- **Primary with icon above**: style=primary, iconPosition=top
- **Secondary with icon on the left**: style=secondary, iconPosition=leading
- **Scrollable primary**: style=primary-scrollable, iconPosition=leading
- **Hovered**: style=primary, iconPosition=top, interaction=hovered
- **Focused**: style=primary, iconPosition=top, interaction=focused
- **Pressed**: style=primary, iconPosition=top, interaction=pressed

## Fidelity

Reference: Compose `material3` 1.4.0, commit `5113b82a4ed6416d6344efa50e41db8cb65928ff` (decisions 1 to 3 of the faithful Material 3 stage). 1 dp = 1 component unit; the container density converts it to image pixels (`docs/COMPONENT-FORMAT.md`, "Units and density"). The values come from the specialization tokens (`tokens`, in the `light` and `dark` modes), which mirror the androidx token files; no color, font or opacity is literal in the component.

**Files used**

- `compose/material3/material3/src/commonMain/kotlin/androidx/compose/material3/Tab.kt` (lines 90 to 123: `Tab` with text and icon, the style `PrimaryNavigationTabTokens.LabelTextFont`; 154 to 196: `LeadingIconTab`, height `SmallTabHeight`, `padding(horizontal = 16)` and the 8 space; 229 to 262: the base `Tab`, which takes the row width; 270 to 293: `TabTransition` and the content color; 301 to 364: `TabBaselineLayout`, the height 48 or 72; 367 to 417: `placeTextOrIcon` and `placeTextAndIcon`; 420 to 438: `SmallTabHeight` 48, `LargeTabHeight` 72, `HorizontalTextPadding` 16, `SingleLineTextBaselineWithIcon` 14, `IconDistanceFromBaseline` 20.sp and `TextDistanceFromLeadingIcon` 8).
- `compose/material3/material3/src/commonMain/kotlin/androidx/compose/material3/TabRow.kt` (lines 150 to 165: `PrimaryTabRow`, indicator with `matchContentSize = true`; 201 to 216: `SecondaryTabRow`, indicator with `matchContentSize = false`; 253 to 282 and 324 to 350: the scrollable rows; 392 to 505: `TabRowImpl`, `tabWidth = tabRowWidth / tabCount` (447) and the indicator of at least 24 (459 to 461); 511 to 650: `ScrollableTabRowImpl`, the tab of `maxOf(minTabWidth, width)` (605) and the indicator centered on the tab (637); 682 to 745: `TabIndicatorOffsetNode`; 976 to 1090: `TabRowDefaults` with `ScrollableTabRowMinTabWidth` 90 (981), `ScrollableTabRowEdgeStartPadding` 52 (987), the container and content colors (998 to 1018), `PrimaryIndicator` (1054) and `SecondaryIndicator` (1078)).
- `compose/material3/material3/src/commonMain/kotlin/androidx/compose/material3/Divider.kt` (lines 49 to 61: `HorizontalDivider`, a line of `DividerDefaults.Thickness`; 113 to 116: `DividerDefaults`).
- `compose/material3/material3/src/commonMain/kotlin/androidx/compose/material3/tokens/PrimaryNavigationTabTokens.kt` (lines 25 to 51: 3 indicator in `Primary`, `RoundedCornerShape(3)`, `Surface` container of 48, 24 icon, active `Primary` and inactive `OnSurfaceVariant` colors, `LabelTextFont` `TitleSmall`) and `SecondaryNavigationTabTokens.kt` (lines 24 to 42: active `OnSurface`, inactive `OnSurfaceVariant`, `ContainerHeight` 48).
- `compose/material3/material3/src/commonMain/kotlin/androidx/compose/material3/tokens/DividerTokens.kt` (lines 23 to 26: `Color` `OutlineVariant`, `Thickness` 1) and `TypographyTokens.kt` (`TitleSmall`: 14, line 20, weight 500, spacing 0.1).
- `compose/material3/material3/src/commonMain/kotlin/androidx/compose/material3/tokens/PrimaryNavigationTabTokens.kt` and `tokens/SecondaryNavigationTabTokens.kt` (lines 33 to 50 and 32 to 42: `Active*`/`Inactive*` `Hover`, `Focus` and `Pressed` of the icon and the label; only `Primary` names `Active*`, and all repeat the normal state color) and `Tab.kt` (lines 166 to 169: `ripple(bounded = true, color = selectedContentColor)`).
- `compose/material3/material3/src/commonMain/kotlin/androidx/compose/material3/tokens/StateTokens.kt` (lines 22 to 25: `HoverStateLayerOpacity`, `FocusStateLayerOpacity`, `PressedStateLayerOpacity`; `DraggedStateLayerOpacity` 0.16 is the `state-dragged`).

**How the drawing follows Compose**

- Fixed row: the tabs split the width equally (`repeat.distribute: "fill"`, the `tabWidth = tabRowWidth / tabCount` of `TabRowImpl`), over the `surface` background. The height is the marking's: 48 (`SmallTabHeight`) and 72 with stacked icon and text (`LargeTabHeight`); a tab with only text or only an icon is centered in the height (`placeTextOrIcon`).
- 1 divider in `outline-variant` at the bottom (`HorizontalDivider`), a frame with `stroke.sides: ["bottom"]` drawn below the tabs and the indicators. The default `HorizontalDivider` uses `DividerTokens.Color` (`OutlineVariant`), not the `DividerColor` of the secondary token.
- Label in `title-small` from the tokens (14, line 20, weight 500, spacing 0.1), without `family`. 24 icon from the library set (`icon` node), in the same color as the label.
- Colors: the selected tab in `primary` on the primary rows and in `on-surface` on the secondary ones (`ActiveLabelTextColor` and `ActiveIconColor` of each token); the others in `on-surface-variant` (`InactiveLabelTextColor`). Light and dark follow the same tokens.
- Icon above the text (`Tab`), by baseline like `placeTextAndIcon`: the `stacked label` node (`scrollable stacked label` in the scrollable ones) carries `baselinePadding` with `top` 20 and `bottom` 9. The `top` is the distance from the icon to the first baseline (`IconDistanceFromBaseline`, `Tab.kt` lines 435 and 407 to 409: the icon ends 20 above it). The `bottom` is that from the bottom of the tab to the last baseline: `DoubleLineTextBaselineWithIcon` 6 (line 432) plus the 3 indicator (`ActiveIndicatorHeight`, lines 398 to 400), 9 with two lines; with one line it is `SingleLineTextBaselineWithIcon` 14 plus 3, 17, and the difference of 8 is the bottom padding of the `stack`, which disappears when the label's `$lines` exceeds 1 (the lines measured, at the tab width). In the 72 tab with one line the icon sits 11 from the top and the baseline 17 from the bottom, in any font, not only Roboto 14/20. Icon on the left (`LeadingIconTab`): icon, 8 and text, centered together.
- Two-line label in the fixed row: the stacked label wraps by word at the tab width minus the 2 × 16 of the `HorizontalTextPadding` (`width: "fill"`, `font.maxLines: 2`, lines centered like the `TextAlign.Center` on line 107) and moves up, with the last baseline 9 from the bottom and the icon 20 above the first. Each tab uses its own lines: a short tab in the same row stays at 17. The primary indicator follows the widest line of the label and stays inside the tab, like `matchContentSize`.
- Primary indicator: 3 high in `primary`, corner 3 (the token's `RoundedCornerShape(3)`, which at a height of 3 becomes 1.5), the size of the content (`matchContentSize`: the text, or the icon, the space and the text in the `LeadingIconTab`) and at least 24 (`minWidth`), centered on the tab. Secondary indicator: 3 high (`SecondaryIndicator` uses `ActiveIndicatorHeight`, not 2) in `primary`, across the whole tab width, no corner, drawn by `stroke.sides: ["bottom"]` of 3. Only the selected tab carries an indicator.
- Scrollable: initial inset of 52 (`ScrollableTabRowEdgeStartPadding`), tabs with the content width plus 2 times 16 (`HorizontalTextPadding`) and at least 90 (`minWidth`, in place of the rectangle with no height that did this in `formatVersion` 2). With the icon on the left the tab measures 16 + icon + 8 + text + 16.
- Label centered by the cap height (`cap-middle`): the `label` node uses `font.verticalAlign: "cap-middle"`; with the icon above, the label is the `stacked label` node, `hug` and positioned by baseline (as described above), and in the other cases, a single line with or without an icon beside it, the `label` node takes the tab height (`height: "fill"`). The Compose `Text` centers by the font line box (ascent and descent); the drawing centers the cap height in the box, and with Roboto the two coincide to within 1 px.

**Interaction state (`interaction` field)**

The field chooses the resting appearance of a state; it does not go into the `code` or the `variants`. The options are `none` and the three states that the tab tokens name: `hovered`, `focused` and `pressed` (there is no `Dragged*`). **This type has no `enabled`**, so there is no disabled state that wins: the state is always drawn.

- **State layer:** the `state` node is a `rect` the size of the tab (the whole tab, the `ripple(bounded = true)` of the `Tab`), behind the content, in the ripple color: `selectedContentColor`, which in the drawing is the color of the selected tab (`primary` on the primary rows, `on-surface` on the secondary ones). The opacity comes from the `state-hover` (0.08), `state-focus` (0.10) and `state-pressed` (0.10) tokens. The tab tokens **do not name** the layer or the opacity: it is the resting `Tab` ripple.
- **Content colors:** `ActiveHover*`, `ActiveFocus*` and `ActivePressed*` (icon and label) repeat `primary`, and the `Inactive*` ones `on-surface`: they are the usual colors, so the icon and label do not change.
- **Item of the state:** it applies to the selected item (decision 6 of the stage); with no selected item nothing changes. Compose draws the state on the item that the mouse, focus or touch reaches; choosing "the first one" would need the item index in the `repeat` (#897), and an item index field is out of scope. The state examples carry the `items` of the `preview`: in the Catalog the example draws the destinations, with the state layer on the selected item.

**What still differs from Compose**

- **No named slot.** The tabs are the `items` table (one `Tab` per row), the indicator and the width of each tab follow `selectedTabIndex` and the `style`, and the row's `minTabWidth` and `edgePadding` measure the rows: a `tabs` slot would duplicate the table and the selected tab would not have a row to follow. A free-content `Tab` stays out (see below).
- Color of the unselected tabs: in Compose, without `selectedContentColor` and `unselectedContentColor`, the `Tab` paints all tabs with the row content color (`unselectedContentColor` is the `selectedContentColor`), and the inactive ones are only `OnSurfaceVariant` when the screen passes the colors. The drawing follows the tokens (`InactiveLabelTextColor`) and the type's `code` does not pass the colors.
- No animated ripple or focus ring (Compose does not define `FocusIndicatorColor` for it at the pinned commit), no indicator and color animation, no scrolling (`scrollState`) and no shift that centers the selected tab: in the scrollable ones, what goes past the width is cut off.
- The row height depends on the content in Compose: `max(72, icon + text + 20)` (`Tab.kt` lines 327 to 340), 72 with one line and 84 with a two-line label under the icon. Here it is the marking's (48 without a rectangle, the literal of `sizing.height`: `$lines` and `$rows` do not see the single-line text of the table, so the height does not follow the items). On a 72 marking, a two-line label raises the icon 1 above the top of the tab, because the position follows Compose (the last baseline 9 from the bottom) and the height does not grow; to see the whole tab, the marking needs 84.
- Long label: the drawing wraps into up to two lines (`maxLines` 2) only on the label under the icon of the fixed row; what goes past two lines is cut off, and Compose, without `maxLines`, would grow the tab. In the scrollable ones the tab has the content width, so the label under the icon only wraps with a line break written in the text. With the icon on the left and in text-only tabs the label stays on one line, without wrapping, and the indicator follows the full text width even when it goes past the tab (Compose limits it to the `tabWidth`).
- No `badge` over the icon (`Modifier.badgeBounds`) and no free-content `Tab`.
