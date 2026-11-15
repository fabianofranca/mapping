# Dropdown menu

A drop-down menu with a list of actions or options. Menu opens over an anchor element (an icon button, for example); exposed is attached to a text field and picks a value among the options.

Annotation type: `dropdown-menu` (Components layer).

## Fields

| Key           | Label       | Type   | Required | Options                      | Default | Description                                                                                                                                                                                                                                                                                                                                                                                    |
| ------------- | ----------- | ------ | -------- | ---------------------------- | ------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `style`       | Style       | enum   | no       | `menu`, `exposed`            | `menu`  | menu (DropdownMenu, a popup anchored to an element) or exposed (ExposedDropdownMenuBox, a text field with the menu attached to it; requires an opt-in).                                                                                                                                                                                                                                        |
| `items`       | Items       | table  | yes      | see Columns below            |         | One item per row, in the order they appear in the menu.                                                                                                                                                                                                                                                                                                                                        |
| `expanded`    | Open        | enum   | no       | `true`, `false`              | `true`  | true shows the menu; false hides it (in exposed only the field is left). In code it is the screen's `expanded` state.                                                                                                                                                                                                                                                                          |
| `label`       | Field label | string | no       |                              |         | Label of the exposed text field. Empty = no label. Only applies to exposed.                                                                                                                                                                                                                                                                                                                    |
| `value`       | Field value | string | no       |                              |         | Chosen option, shown in the exposed text field. Only applies to exposed.                                                                                                                                                                                                                                                                                                                       |
| `interaction` | Interaction | enum   | no       | `none`, `hovered`, `focused` | `none`  | Resting appearance of the interaction state, on the exposed field (hovered or focused: 2 indicator in primary and label in primary) and on the selected item of the open menu (state layer); none = no highlight. It only changes the drawing, it does not go in the code. The menu has no enabled in the type (no enabled): the field always draws; the disabled item does not get the layer. |

Columns of `items` (one row per item):

| Key            | Label         | Type   | Required | Options                                                   | Default |
| -------------- | ------------- | ------ | -------- | --------------------------------------------------------- | ------- |
| `text`         | Text          | string | yes      |                                                           |         |
| `leadingIcon`  | Leading icon  | string | no       | free text; icon suggestions (`Home`, `Search`, `Person`…) |         |
| `trailingIcon` | Trailing icon | string | no       | free text; icon suggestions (`Home`, `Search`, `Person`…) |         |
| `enabled`      | Enabled       | enum   | no       | `true`, `false`                                           | `true`  |
| `selected`     | Selected      | enum   | no       | `true`, `false`                                           | `false` | true marks the item (secondary-container background). It is the item that receives the menu's interaction state. |

## Compose

- Symbol: `androidx.compose.material3.DropdownMenu`
- File (`path`): `compose/material3/material3/src/commonMain/kotlin/androidx/compose/material3/Menu.kt`
- The `style` field chooses the symbol; values without their own case use the base one.

| `style`       | Symbol                   |
| ------------- | ------------------------ |
| `menu` (base) | `DropdownMenu`           |
| `exposed`     | `ExposedDropdownMenuBox` |

The `exposed` case also swaps the file (`path`): `compose/material3/material3/src/commonMain/kotlin/androidx/compose/material3/ExposedDropdownMenu.kt`.

How the annotation becomes the call (the values below are examples; the parameter names and expressions are those of `params` and `values` in `code`):

```kotlin
// style menu: DropdownMenu anchored to an IconButton
Box {
    IconButton(onClick = { expanded = true }) {
        Icon(Icons.Filled.MoreVert, contentDescription = "More options")
    }
    DropdownMenu(expanded = expanded, onDismissRequest = { expanded = false }) {
        // a row of items becomes a DropdownMenuItem
        DropdownMenuItem(
            text = { Text("Edit") },
            onClick = { expanded = false },
            leadingIcon = { Icon(Icons.Filled.Edit, contentDescription = null) },
        )
        DropdownMenuItem(
            text = { Text("Delete") },
            onClick = { expanded = false },
            leadingIcon = { Icon(Icons.Filled.Delete, contentDescription = null) },
            enabled = false,
        )
    }
}

// style exposed: ExposedDropdownMenuBox (@OptIn(ExperimentalMaterial3Api::class))
ExposedDropdownMenuBox(expanded = expanded, onExpandedChange = { expanded = it }) {
    TextField(
        value = "English",
        onValueChange = {},
        readOnly = true,
        label = { Text("Language") },
        trailingIcon = { ExposedDropdownMenuDefaults.TrailingIcon(expanded = expanded) },
        modifier = Modifier.menuAnchor(ExposedDropdownMenuAnchorType.PrimaryNotEditable),
    )
    ExposedDropdownMenu(expanded = expanded, onDismissRequest = { expanded = false }) {
        DropdownMenuItem(
            text = { Text("English") },
            onClick = { expanded = false },
            contentPadding = ExposedDropdownMenuDefaults.ItemContentPadding,
        )
    }
}
```

Notes from `code` (what the tool hands to the agent):

> Stable, no opt-in. The menu is a popup anchored to the composable where it is declared: put it in a `Box` next to the anchor element (the `IconButton` that opens it) and connect `expanded` to a screen state (`var expanded by remember { mutableStateOf(<expanded>) }`), with `onDismissRequest = { expanded = false }`. Inside, one `DropdownMenuItem` per row of `items`: `text = { Text(<text>) }`, `onClick = { expanded = false; … }`, `leadingIcon = { Icon(Icons.Filled.<leadingIcon>, contentDescription = null) }` and `trailingIcon = { Icon(Icons.Filled.<trailingIcon>, contentDescription = null) }` only when filled, and `enabled = <enabled>`. The width goes from 112 to 280 dp by the content. Since material3 1.4.0 the icons require `androidx.compose.material:material-icons-core` (or `-extended`) or a Material Symbol downloaded with `painterResource`. Anchored (`anchor`, side `bottom`, alignment `start`), the menu opens right below the element, aligned to its start: it is the `DropdownMenu` declared next to the element, with the default `offset` `DpOffset(0.dp, 0.dp)`.

`exposed` variant: Requires @OptIn(ExperimentalMaterial3Api::class) (the `ExposedDropdownMenuBox` and the `ExposedDropdownMenu` are experimental at the pinned commit). `ExposedDropdownMenuBox(expanded = expanded, onExpandedChange = { expanded = it }) { … }`, with `expanded` connected to a screen state (`var expanded by remember { mutableStateOf(<expanded>) }`). Inside go a `TextField` (or `OutlinedTextField`, as in the text-field type) with `value = <value>`, `onValueChange = {}`, `readOnly = true`, `label = { Text(<label>) }`, `trailingIcon = { ExposedDropdownMenuDefaults.TrailingIcon(expanded = expanded) }` and `Modifier.menuAnchor(ExposedDropdownMenuAnchorType.PrimaryNotEditable)` (the `menuAnchor()` without arguments is `@Deprecated`), and then `ExposedDropdownMenu(expanded = expanded, onDismissRequest = { expanded = false }) { … }`, an extension of the `ExposedDropdownMenuBoxScope`, with one `DropdownMenuItem` per row of `items` (`onClick` stores the choice, updates `<value>` and closes with `expanded = false`; `contentPadding = ExposedDropdownMenuDefaults.ItemContentPadding`). The menu has the width of the field (`matchAnchorWidth = true`, the default).

## Examples

- **Open menu**: style=menu, expanded=true
- **Closed exposed field**: style=exposed, expanded=false, label=Country, value=Brazil
- **Open exposed field**: style=exposed, expanded=true, label=Language, value=English
- **Hovered**: style=exposed, expanded=false, label=Country, value=Brazil, interaction=hovered
- **Focused**: style=exposed, expanded=true, label=Language, value=English, interaction=focused
- **Items of different widths**: style=menu, expanded=true

## Fidelity

Reference: Compose `material3` 1.4.0, commit `5113b82a4ed6416d6344efa50e41db8cb65928ff` (decisions 1 to 3 of the faithful Material 3 stage). 1 dp = 1 component unit; the container density converts it to image pixels (`docs/COMPONENT-FORMAT.md`, "Units and density"). The values come from the specialization tokens (`tokens`, in the `light` and `dark` modes), which mirror the androidx token files; no color, font or radius is literal in the component, no text node declares `family` (all inherit `font-sans`) and the icons are the `icon` node of the library's set (the item's through the field's `$switch`, the field's arrow through the `expanded` state), with no SVG path in the component.

**Files used**

- `compose/material3/material3/src/commonMain/kotlin/androidx/compose/material3/Menu.kt` (lines 181 to 258: `MenuDefaults`, `ShadowElevation` = `MenuTokens.ContainerElevation`, the shape, the container color and `itemColors()` by the `ListTokens`, `DropdownMenuItemContentPadding` of 12 horizontally; 359 to 417: `DropdownMenuContent`, the `Surface` and the `Column` with `padding(vertical = DropdownMenuVerticalPadding)` and `width(IntrinsicSize.Max)`; 419 to 505: `DropdownMenuItemContent`, the `Row` with `sizeIn(minWidth = 112, maxWidth = 280, minHeight = 48)`, `padding(contentPadding)`, `ProvideTextStyle(labelLarge)` on line 450, the leading and trailing icon in a `Box` of minimum width 24 and the text with 12 on each side that has an icon; 523 to 528: the constants 48, 12, 8, 112 and 280).
- `compose/material3/material3/src/commonMain/kotlin/androidx/compose/material3/tokens/MenuTokens.kt` (`ContainerColor` `SurfaceContainer`, `ContainerElevation` `Level2` = 3, `ContainerShape` `CornerExtraSmall`) and `tokens/ListTokens.kt` (`ListItemLabelTextColor` `OnSurface`, `ListItemLeadingIconColor` and `ListItemTrailingIconColor` `OnSurfaceVariant`, the disabled colors `OnSurface` with opacity 0.38, 24 icons) and `tokens/ElevationTokens.kt` (`Level2` 3 dp).
- `compose/material3/material3/src/commonMain/kotlin/androidx/compose/material3/ExposedDropdownMenu.kt` (lines 137 to 150: `ExposedDropdownMenuBox`; 310 to 365: the `ExposedDropdownMenu` with `matchAnchorWidth = true` and `exposedDropdownSize`; 512 to 514: `TrailingIcon`, the `Icons.Filled.ArrowDropDown` rotated 180 degrees when open; 844 and 845: `ItemContentPadding`; 1536: `ExposedDropdownMenuItemHorizontalPadding` 16) and `tokens/FilledAutocompleteTokens.kt` (field `SurfaceContainerHighest` with shape `CornerExtraSmallTop`, 1 indicator in `OnSurfaceVariant`, label and text `BodyLarge`, 24 trailing icon in `OnSurfaceVariant`, menu `SurfaceContainer`, `Level2` and `CornerExtraSmall`). The field follows the filled `TextField` described in `text-field.md`.
- `compose/material3/material3/src/commonMain/kotlin/androidx/compose/material3/tokens/MenuTokens.kt` (lines 24 to 29: `FocusIndicatorColor` and the `ListItemSelected*` roles: `ListItemSelectedContainerColor` `SecondaryContainer`, `ListItemSelectedLabelTextColor` and `ListItemSelectedLeadingTrailingIconColor` `OnSecondaryContainer`), `compose/material3/material3/src/commonMain/kotlin/androidx/compose/material3/tokens/FilledTextFieldTokens.kt` (lines 45 to 73, the exposed field is a filled `TextField`) and `compose/material3/material3/src/commonMain/kotlin/androidx/compose/material3/tokens/ListTokens.kt`.
- `compose/material3/material3/src/commonMain/kotlin/androidx/compose/material3/tokens/StateTokens.kt` (lines 22 to 25: `HoverStateLayerOpacity`, `FocusStateLayerOpacity`, `PressedStateLayerOpacity`; `DraggedStateLayerOpacity` 0.16 is the `state-dragged`).

**How the drawing follows Compose**

- Menu: `surface-container`, shape `corner-extra-small` (4), the two level 2 shadows (point: `y` 1, `blur` 2; ambient: `y` 2, `blur` 6, `spread` 2; tokens `elevation-2-point-*` and `elevation-2-ambient-*`), padding of 8 on top and bottom and items from the top. The width is that of the widest item (the text, the icons and the padding), between 112 and 280, like the `Column`'s `IntrinsicSize.Max` and the items' `sizeIn`: the `sizing.width` is `hug` in the `menu` style (and `fill` in `exposed`, which follows the field), with the `minWidth` and `maxWidth` on the root, which apply when fitting, and on the menu frame, which apply with the given box (the menu fills the box within the same range); closed (`expanded: false`) the menu is not drawn.
- Item: minimum height of 48 (`minHeight`), which grows with the text when it wraps; horizontal padding of 12 in the menu and 16 in exposed (`ItemContentPadding`). Text in `label-large` (14/20, weight 500, spacing 0.1, the `ProvideTextStyle`'s `labelLarge`) in `on-surface`; leading and trailing icon of 24 in `on-surface-variant`, with 12 between the icon and the text (the text sits between the icons, by the `left` and `right` anchors of the item frame, and the widest item decides the menu width). Disabled: text and icons in `on-surface` at 0.38 (`state-disabled-content`).
- Exposed: the 56 field is the filled `TextField`: background `surface-container-highest` with the top radius of `corner-extra-small`, 1 indicator only at the bottom (`stroke.sides: ["bottom"]`) in `on-surface-variant`, label in `body-large` when there is no value and in `body-small` over the value when there is one, value in `body-large` on one line, 24 arrow in `on-surface-variant` 12 from the edge (`arrow_drop_down` closed and `arrow_drop_up` open, the `ArrowDropDown` rotated 180 degrees). The menu comes right below, with the width of the field (`matchAnchorWidth`).
- Label, value and item text (one line) are centered by the capital letter height (`font.verticalAlign: "cap-middle"`). Compose's `Text` centers by the font's line box; with Roboto the two coincide within 1 px.

**Interaction state (`interaction` field)**

The field chooses the resting appearance of a state; it does not go in the `code` or in the `variants`. The options are `none`, `hovered` and `focused`: the exposed field is a filled `TextField`, which defines `Hover*` and `Focus*` (no `Pressed*` or `Dragged*`), and the menu tokens (`MenuTokens.kt`) define no pressed or dragged state. The state applies in **two places** (decision 6 of the stage):

- **Exposed field** (`exposed` style): the same drawing as the filled `text-field`. When focused, the indicator goes to 2 thick in `primary` and the label goes to `primary` (`FilledTextFieldTokens.FocusActiveIndicatorColor`, `FocusActiveIndicatorHeight` and `FocusLabelColor`, lines 63, 64 and 66); with the mouse, the indicator goes to `on-surface` (`HoverActiveIndicatorColor`, line 70) and the label stays `on-surface-variant`. The menu's field has no error or disabled state, so there are no `Error*` colors.
- **Selected item of the open menu:** the `selected` column of the `items` table marks the item. It gets the `secondary-container` background, the text and icons in `on-secondary-container` (`ListItemSelectedContainerColor`, `ListItemSelectedLabelTextColor` and `ListItemSelectedLeadingTrailingIconColor`, lines 26 to 28) and, with `hovered` or `focused`, the `state` node: a `rect` the size of the item, in the selected label color, `on-secondary-container`, with `opacity` from the tokens `state-hover` (0.08) and `state-focus` (0.10). The menu tokens **do not name** the layer: it is the `card` convention, the content color.
- **Without a selected item** the menu draws no layer (like the `segmented-button`, with no selected segment). Decision 6 says to use the first item in that case, but that requires the index in `repeat`, which format 4 does not have (#897).
- **Disabled item** (`enabled` `false` in the row) gets neither the layer nor the `secondary-container` background: disabled wins, even when selected.

**What still differs from Compose**

- **No named slot.** The rows of the menu are the `items` table (one `DropdownMenuItem` per row, with its icon, in the code), and the menu measures its rows to hug; a `content` slot would make two sources of the same list, the field and the children, and the `get_code_hints` could not tell them apart. The `leadingIcon` and `trailingIcon` of each item are fields of the row, not slots. (The decision of the named slots, `docs/COMPONENT-FORMAT.md`, "Several slots and default content".)
- The text of an item that exceeds what fits in 280 wraps into lines, and the measured width is that of the widest line after wrapping (the two-pass `hug` rule), so the menu may measure slightly less than 280; Compose uses the full 280 in that case.
- The menu appears in the drawing right below the field (exposed) or alone (menu): Compose's popup is positioned by the anchor, the window and the `offset` (default `DpOffset(0, 0)`), and the opening scale and alpha animation does not exist. Here the position is the marking's anchor: the root declares `anchor` `bottom`/`start`, with `offset` 0 (the menu right below the element, aligned to its start, in `rtl` on the right), and Snap to anchor puts it under the field. The menu does not follow the anchor's width (`matchAnchorWidth`): the anchor only positions. Compose also flips the menu upward when there is no window space below (`MenuVerticalMargin`); the drawing stays on the requested side.
- The `interaction` is a still frame: no animated ripple, cursor or keyboard selection. The focus ring (`FocusIndicatorColor`, `secondary`, `MenuTokens.kt` line 25) is drawn on the selected item of the open menu, in `focused`: a 3 ring in `secondary`, 2 away from the shape (`stroke.offset`), outside the box (the width and the offset are those of the stage decision; the `*Tokens.kt` only carries the color). The `selected` column and the `secondary-container` background of the selected item are M3 drawing through `MenuTokens.ListItemSelected*`; Compose 1.4.0's `DropdownMenuItem` has no `selected`, and the column does not go in the `code`. Rows from earlier projects, without the `selected` column, draw with the warning "field not provided: selected" (the engine only scopes the columns that some row carries, as already happens with `enabled` and `trailingIcon`).
- The two shadows (point and ambient) come from the tokens `elevation-2-point-*` and `elevation-2-ambient-*` (`$token` in `shadow`, a list of two shadows with `spread`); the tonal elevation is not drawn. Material 3 elevation values for the web: `elevation/internal/_elevation.scss` of `material-components/material-web` (version 2.5.0, commit `37aa14b843dcaeb3a46f898679fa6fcd109b1905`), a source outside Compose, which on Android hands the elevation to the platform and does not carry the numbers: point shadow in black at 30% and ambient shadow in black at 15%, with `y`, `blur` and `spread` per level (tokens `elevation-2-point-*` and `elevation-2-ambient-*`).
- The top radius of the exposed field is the list `[corner-extra-small, corner-extra-small, 0, 0]` (`$token` per item), without a taller clipped rectangle.
- The exposed field's value stays on one line (clipped), like `singleLine`; Compose's `TextField` without `singleLine` wraps and grows. No menu scrolling (`verticalScroll`) when the items exceed the available height.
- No free `leadingIcon` and `trailingIcon` (`composable`), custom `contentPadding`, `DropdownMenuItem` with custom `colors`, `onDismissRequest`, and `ExposedDropdownMenuBox` with `OutlinedTextField` or an editable one (input `menuAnchor`).
