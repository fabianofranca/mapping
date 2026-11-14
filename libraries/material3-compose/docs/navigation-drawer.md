# Navigation drawer

Side navigation sheet. Modal covers the screen with a scrim; dismissible pushes the content and can be dismissed; permanent is always in view. Each row of Items is a destination.

Annotation type: `navigation-drawer` (Components layer).

## Fields

| Key           | Label       | Type   | Required | Options                                 | Default | Description                                                                                                                                                                                                                                                                        |
| ------------- | ----------- | ------ | -------- | --------------------------------------- | ------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `headline`    | Header      | string | no       |                                         |         | Optional title at the top of the sheet, above the items.                                                                                                                                                                                                                           |
| `style`       | Style       | enum   | no       | `modal`, `dismissible`, `permanent`     | `modal` | modal (ModalNavigationDrawer), dismissible (DismissibleNavigationDrawer) or permanent (PermanentNavigationDrawer).                                                                                                                                                                 |
| `items`       | Items       | table  | yes      | see Columns below                       |         | One destination per row, in the order they appear in the sheet.                                                                                                                                                                                                                    |
| `interaction` | Interaction | enum   | no       | `none`, `hovered`, `focused`, `pressed` | `none`  | Resting look of the selected item's interaction state: hovered, focused or pressed; none = no state layer. It only changes the drawing, it does not go into the code. The type has no disabled state (no enabled): the state always draws. With no selected item, nothing changes. |

Columns of `items` (one row per item):

| Key        | Label    | Type   | Required | Options                                                   | Default |
| ---------- | -------- | ------ | -------- | --------------------------------------------------------- | ------- |
| `label`    | Label    | string | yes      |                                                           |         |
| `icon`     | Icon     | string | no       | free text; icon suggestions (`Home`, `Search`, `Person`…) |         |
| `selected` | Selected | enum   | no       | `true`, `false`                                           | `false` |
| `badge`    | Badge    | string | no       |                                                           |         |

## Compose

- Symbol: `androidx.compose.material3.ModalNavigationDrawer`
- File (`path`): `compose/material3/material3/src/commonMain/kotlin/androidx/compose/material3/NavigationDrawer.kt`
- The `style` field chooses the symbol; values without a case of their own use the base one.

| `style`        | Symbol                                                         |
| -------------- | -------------------------------------------------------------- |
| `modal` (base) | `ModalNavigationDrawer` (sheet `ModalDrawerSheet`)             |
| `dismissible`  | `DismissibleNavigationDrawer` (sheet `DismissibleDrawerSheet`) |
| `permanent`    | `PermanentNavigationDrawer` (sheet `PermanentDrawerSheet`)     |

How the annotation becomes the call (the values below are examples; the parameter names and the expressions are those of `params` and `values` in `code`):

```kotlin
// style modal: the drawer wraps the Scaffold; the marking is the sheet
ModalNavigationDrawer(
    drawerContent = {
        ModalDrawerSheet {
            Text("Mapping", Modifier.padding(16.dp), style = MaterialTheme.typography.titleSmall)
            NavigationDrawerItem(    // one per row of items
                label = { Text("Inbox") },
                selected = true,
                onClick = { /* screen logic */ },
                icon = { Icon(Icons.Filled.Email, contentDescription = null) },
                badge = { Text("24") },
                modifier = Modifier.padding(NavigationDrawerItemDefaults.ItemPadding),
            )
        }
    },
    drawerState = rememberDrawerState(DrawerValue.Closed),
) {
    Scaffold { innerPadding -> /* screen content */ }
}

// style dismissible: DismissibleNavigationDrawer + DismissibleDrawerSheet (same items)
// style permanent: PermanentNavigationDrawer + PermanentDrawerSheet (no drawerState)
```

Notes from `code` (what the tool hands to the agent):

> Stable, no opt-in. `ModalNavigationDrawer(drawerContent = { ModalDrawerSheet { … } }, drawerState = rememberDrawerState(DrawerValue.Closed)) { <screen content> }`; inside the `ModalDrawerSheet`: one `NavigationDrawerItem` per row of `items`: `label = { Text(<label>) }`, `selected = <selected>`, `onClick = { /* screen logic */ }`, `icon = { Icon(Icons.Filled.<icon>, contentDescription = null) }` (nullable), `badge = { Text(<badge>) }` (nullable) and `modifier = Modifier.padding(NavigationDrawerItemDefaults.ItemPadding)`; the `headline` becomes a `Text(<headline>, Modifier.padding(16.dp), style = MaterialTheme.typography.titleSmall)` before the items. The marking is the sheet: the screen content goes in the last parameter (`content`) and the scrim belongs to the composable. Opening and closing: `drawerState.open()` and `close()` in a coroutine. The drawer wraps the `Scaffold` (`ModalNavigationDrawer { Scaffold { … } }`), it does not take a slot of it. The width (up to 360 dp) belongs to the composable, and `Modifier.width(<marking width>.dp)` adjusts the sheet. Since material3 1.4.0 the icons require `androidx.compose.material:material-icons-core` (or `-extended`) or a Material Symbol downloaded with `painterResource`; the ones that mirror (ArrowBack, KeyboardArrowRight, List) are in `Icons.AutoMirrored.Filled`.

Variant `dismissible`: Stable, no opt-in. `DismissibleNavigationDrawer(drawerContent = { DismissibleDrawerSheet { … } }, drawerState = rememberDrawerState(DrawerValue.Closed)) { <screen content> }`; inside the `DismissibleDrawerSheet`: one `NavigationDrawerItem` per row of `items`: `label = { Text(<label>) }`, `selected = <selected>`, `onClick = { /* screen logic */ }`, `icon = { Icon(Icons.Filled.<icon>, contentDescription = null) }` (nullable), `badge = { Text(<badge>) }` (nullable) and `modifier = Modifier.padding(NavigationDrawerItemDefaults.ItemPadding)`; the `headline` becomes a `Text(<headline>, Modifier.padding(16.dp), style = MaterialTheme.typography.titleSmall)` before the items. No scrim: when opened, the sheet pushes the content beside it. Opening and closing: `drawerState.open()` and `close()` in a coroutine. The drawer wraps the `Scaffold` (`DismissibleNavigationDrawer { Scaffold { … } }`), it does not take a slot of it. The width (up to 360 dp) belongs to the composable. Since material3 1.4.0 the icons require `androidx.compose.material:material-icons-core` (or `-extended`) or a Material Symbol downloaded with `painterResource`; the ones that mirror (ArrowBack, KeyboardArrowRight, List) are in `Icons.AutoMirrored.Filled`.

Variant `permanent`: Stable, no opt-in. `PermanentNavigationDrawer(drawerContent = { PermanentDrawerSheet { … } }) { <screen content> }`, with no `drawerState` (always visible, beside the content in a `Row`); inside the `PermanentDrawerSheet`: one `NavigationDrawerItem` per row of `items`: `label = { Text(<label>) }`, `selected = <selected>`, `onClick = { /* screen logic */ }`, `icon = { Icon(Icons.Filled.<icon>, contentDescription = null) }` (nullable), `badge = { Text(<badge>) }` (nullable) and `modifier = Modifier.padding(NavigationDrawerItemDefaults.ItemPadding)`; the `headline` becomes a `Text(<headline>, Modifier.padding(16.dp), style = MaterialTheme.typography.titleSmall)` before the items. The drawer wraps the `Scaffold` (`PermanentNavigationDrawer { Scaffold { … } }`), it does not take a slot of it. The width (from 240 to 360 dp) belongs to the composable, and `PermanentDrawerSheet(Modifier.width(<marking width>.dp))` adjusts it. Since material3 1.4.0 the icons require `androidx.compose.material:material-icons-core` (or `-extended`) or a Material Symbol downloaded with `painterResource`; the ones that mirror (ArrowBack, KeyboardArrowRight, List) are in `Icons.AutoMirrored.Filled`.

## Examples

- **Modal with headline**: style=modal, headline=Mapping
- **Dismissible**: style=dismissible, headline=Folders
- **Permanent without headline**: style=permanent
- **Hovered**: style=modal, headline=Mapping, interaction=hovered
- **Focused**: style=modal, headline=Mapping, interaction=focused
- **Pressed**: style=modal, headline=Mapping, interaction=pressed

## Fidelity

Reference: Compose `material3` 1.4.0, commit `5113b82a4ed6416d6344efa50e41db8cb65928ff` (decisions 1 to 3 of the faithful Material 3 stage). 1 dp = 1 component unit; the container's density converts it to image pixels (`docs/COMPONENT-FORMAT.md`, "Units and density"). The values come from the specialization's tokens (`tokens`, in the `light` and `dark` modes), which mirror the androidx tokens files; no color, font or opacity is left literal in the component.

**Files used**

- `compose/material3/material3/src/commonMain/kotlin/androidx/compose/material3/NavigationDrawer.kt` (lines 590 to 612: `ModalDrawerSheet`, default shape and color and Level0 elevation; 679 to 700: `DismissibleDrawerSheet`, `RectangleShape`; 764 to 784: `PermanentDrawerSheet`; 786 to 857: `DrawerSheet`, the width between 240 and 360 and the `Surface`; 997 to 1035: `DrawerDefaults`, `shape`, `standardContainerColor`, `modalContainerColor` and the elevations; 1068 to 1111: `NavigationDrawerItem`, `heightIn(min = 56)`, `fillMaxWidth()`, `padding(start = 16.dp, end = 24.dp)` and the 12 `Spacer`s; 1146 to 1188: the item colors and the `ItemPadding` of 12).
- `compose/material3/material3/src/commonMain/kotlin/androidx/compose/material3/tokens/NavigationDrawerTokens.kt` (lines 28 to 58: active and inactive colors, `ActiveIndicatorHeight` 56, `ActiveIndicatorShape` full, `ActiveIndicatorWidth` 336, `ContainerShape` CornerLargeEnd, `ContainerWidth` 360, `HeadlineColor` and `HeadlineFont` title small, `LabelTextFont` and `LargeBadgeLabelFont` label large, `ModalContainerColor` surface container low, `StandardContainerColor` surface).
- `compose/material3/material3/src/commonMain/kotlin/androidx/compose/material3/NavigationDrawer.kt` (lines 1076 to 1090: the item's `Surface` receives `interactionSource` and `color = colors.containerColor(selected)`, so the ripple covers the whole item and takes the `contentColor` from the background color).
- `compose/material3/material3/src/commonMain/kotlin/androidx/compose/material3/tokens/NavigationDrawerTokens.kt` (lines 24 to 51: `Active*`/`Inactive*` `Hover`, `Focus` and `Pressed` of the icon and the label, all equal to the normal state color; `FocusIndicatorColor` `Secondary`, line 40).
- `compose/material3/material3/src/commonMain/kotlin/androidx/compose/material3/tokens/StateTokens.kt` (lines 22 to 25: `HoverStateLayerOpacity`, `FocusStateLayerOpacity`, `PressedStateLayerOpacity`; `DraggedStateLayerOpacity` 0.16 is the `state-dragged`).

**How the drawing follows Compose**

- Sheet 360 wide: the modal in `surface-container-low` with 16 trailing corners (`CornerLargeEnd`); the dismissible and the permanent in `surface`, with no corners. No shadow or tonal elevation (the default elevations are Level0).
- 12 margin on the sides (`NavigationDrawerItemDefaults.ItemPadding`) and 12 at the top; items of 56 minimum height and 336 width, in the `corner-full` shape, with no space between them. `secondary-container` on the selected one.
- Item: 16 inset at the start, 24 icon, 12 up to the label (which takes the rest, `weight(1f)`), 12 up to the badge and 24 inset at the end. Icon, label and badge use the same color: `on-secondary-container` when selected and `on-surface-variant` on the others.
- Label and badge in `label-large` (14 / 20, weight 500, 0.1); optional header of 56 height with 16 inset, in `title-small` and `on-surface-variant` (`HeadlineFont` and `HeadlineColor`).
- Labels centered by the cap height (`cap-middle`): `title`, `label` and `badge` use `font.verticalAlign: "cap-middle"`; the `title` takes the height of the 56 header (`height: "fill"`), and `label` and `badge` stay `hug` in the destination, which measures by the content with a minimum height of 56. Compose's `Text` centers by the font's line box (ascent and descent); the drawing centers the cap height in the box, and with Roboto the two coincide to within 1 px.

**Interaction state (the `interaction` field)**

The field chooses the resting look of a state; it does not go into the `code` or the `variants`. The options are `none` and the three states that `NavigationDrawerTokens.kt` names (`ActiveHover*`, `ActiveFocus*`, `ActivePressed*`): `hovered`, `focused` and `pressed` (there is no `Dragged*`). **This type has no `enabled`**, so there is no disabled state that wins: the state always draws.

- **State layer:** the `state` node is a `rect` the size of the item (the 56 pill, `corner-full`), on top of it, in the content color of the selected item, `on-secondary-container` (the `Surface` ripple uses the `contentColor` of the `secondary-container` background). The opacity comes from the tokens `state-hover` (0.08), `state-focus` (0.10) and `state-pressed` (0.10). The drawer tokens **do not name** the layer or the opacity: it is the `Surface` ripple, at rest.
- **Content colors:** the `Active*Hover/Focus/Pressed*` repeat `on-secondary-container`: icon, label and badge do not change.
- **State item:** it applies to the selected item (decision 6 of the stage); with no item selected nothing changes. Compose draws the state on the item that the mouse, the focus or the touch reaches; choosing "the first" would require the item index in the `repeat` (#897), and an item index field is left out. The state examples carry the `preview`'s `items`: in the Catalog the example draws the destinations, with the state layer on the selected item.

**What still differs from Compose**

- `NavigationDrawerItem` does not apply a text style: the typography comes from the `Text` that the screen passes. The drawing uses the tokens file's (`LabelTextFont`, `LargeBadgeLabelFont`, `HeadlineFont`); the official header example uses `titleLarge`. The 56 header and the 12 space at the top are a convention of the drawing (from the example), not of the composable.
- The modal's radius is the list `[0, corner-large, corner-large, 0]` (`$token` per item): the 16 of `CornerLargeEnd` comes from `corner-large`.
- Compose's width is between 240 and 360 (`sizeIn`); here the sheet takes the marking's width. Scrim, gesture, animation, the badge as a composable (here it is text) and the `DrawerState` variants are left out of the drawing.
- The `interaction` is a resting frame: no animated ripple, and the focus ring (`FocusIndicatorColor`, `NavigationDrawerTokens.kt` line 40) applies to the state's item: in `focused` it draws a 3 ring in `secondary`, offset 2 from the shape (`stroke.offset`), outside the box (the width and the offset are those of the stage decision; the `*Tokens.kt` only brings the color).
