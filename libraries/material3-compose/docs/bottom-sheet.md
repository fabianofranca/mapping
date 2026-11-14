# Bottom sheet

Sheet that slides up from the bottom of the screen. Modal covers the screen with a scrim and is dismissed; standard stays beside the content.

Annotation type: `bottom-sheet` (Components layer).

## Fields

| Key               | Label            | Type   | Required | Options             | Default | Description                                                                      |
| ----------------- | ---------------- | ------ | -------- | ------------------- | ------- | -------------------------------------------------------------------------------- |
| `title`           | Title            | string | no       |                     |         | Title at the top of the sheet.                                                   |
| `style`           | Style            | enum   | no       | `modal`, `standard` | `modal` | modal (ModalBottomSheet) or standard (BottomSheetScaffold).                      |
| `dragHandle`      | Drag handle      | enum   | no       | `true`, `false`     | `true`  | false removes the handle at the top of the sheet.                                |
| `sheetPeekHeight` | Peek height (dp) | number | no       |                     | `56`    | Visible height of the collapsed sheet in dp. Only applies in the standard style. |
| `items`           | Items            | table  | no       | see Columns below   |         | Sheet actions, one per row.                                                      |

Columns of `items` (one row per item):

| Key     | Label | Type   | Required | Options                                                   | Default |
| ------- | ----- | ------ | -------- | --------------------------------------------------------- | ------- |
| `label` | Label | string | yes      |                                                           |         |
| `icon`  | Icon  | string | no       | free text; icon suggestions (`Home`, `Search`, `Person`…) |         |

## Compose

- Symbol: `androidx.compose.material3.ModalBottomSheet`
- File (`path`): `compose/material3/material3/src/commonMain/kotlin/androidx/compose/material3/ModalBottomSheet.kt`
- The `style` field chooses the symbol; values without their own case use the base one.

| `style`        | Symbol                                                |
| -------------- | ----------------------------------------------------- |
| `modal` (base) | `ModalBottomSheet`                                    |
| `standard`     | `BottomSheetScaffold` (file `BottomSheetScaffold.kt`) |

How the annotation becomes the call (the values below are examples; the parameter names and expressions are those of `params` and `values` in the `code`):

```kotlin
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun Sheet(onDismiss: () -> Unit) {
    ModalBottomSheet(
        onDismissRequest = onDismiss,
        sheetState = rememberModalBottomSheetState(),
        // dragHandle = null when dragHandle = false
    ) {
        Column {
            Text("Share", style = MaterialTheme.typography.titleLarge)
            ListItem(    // one per row of items
                headlineContent = { Text("Copy link") },
                leadingContent = { Icon(Icons.Filled.Share, contentDescription = null) },
            )
        }
    }
}

// style standard: BottomSheetScaffold
BottomSheetScaffold(
    scaffoldState = rememberBottomSheetScaffoldState(),
    sheetPeekHeight = 96.dp,
    sheetContent = { Column { /* title and items, as above */ } },
) { innerPadding ->
    /* screen content behind the sheet */
}
```

Notes from the `code` (what the tool hands to the agent):

> Requires @OptIn(ExperimentalMaterial3Api::class). `onDismissRequest` and `sheetState = rememberModalBottomSheetState()` connect to the screen logic, and the scrim is drawn by the composable itself. The `content` (a Column) carries the `title` in a `Text` with `MaterialTheme.typography.titleLarge` and, for each row of `items`, `ListItem(headlineContent = { Text(<label>) }, leadingContent = { Icon(Icons.Filled.<icon>, contentDescription = null) })`. With `dragHandle` set to `false`, pass `dragHandle = null`.

`standard` variant: Requires @OptIn(ExperimentalMaterial3Api::class). The sheet content goes in `sheetContent = { … }` (a Column with the `title` and the `items`, as in the modal) and `sheetPeekHeight = <sheetPeekHeight>.dp`; the screen content behind the sheet goes in `content = { innerPadding -> … }`. With `dragHandle` set to `false`, pass `sheetDragHandle = null`; `scaffoldState = rememberBottomSheetScaffoldState()` connects to the screen logic.

## Examples

- **Modal**: title=Share, style=modal, dragHandle=true
- **Collapsed standard**: title=Details, style=standard, sheetPeekHeight=96

## Fidelity

Reference: Compose `material3` 1.4.0, commit `5113b82a4ed6416d6344efa50e41db8cb65928ff` (decisions 1 to 3 of the faithful Material 3 stage). 1 dp = 1 component unit; the container density converts to image pixels (`docs/COMPONENT-FORMAT.md`, "Units and density"). The values come from the specialization tokens (`tokens`, in the `light` and `dark` modes), which mirror the androidx token files; no color, font or opacity is literal in the component, no text node declares `family` (all inherit `font-sans`) and the icon of the items is the `icon` node of the library set, through the `$switch` from the Compose name to the set one, with no SVG path in the component.

**Files used**

- `compose/material3/material3/src/commonMain/kotlin/androidx/compose/material3/ModalBottomSheet.kt` (lines 123 to 137: `ModalBottomSheet`, `sheetMaxWidth`, `shape`, `containerColor`, `tonalElevation` and the default `dragHandle`; 266 to 358: the `Surface` with `widthIn(max = sheetMaxWidth)` and `fillMaxWidth()` (280), the shape, the color and the `tonalElevation` without `shadowElevation`; 361 to 431: the `Column` with the handle at the top, centered by `DragHandleWithTooltip`, and then the `content`).
- `compose/material3/material3/src/commonMain/kotlin/androidx/compose/material3/BottomSheetScaffold.kt` (lines 118 to 139: `BottomSheetScaffold`, `sheetPeekHeight`, `sheetShape`, `sheetTonalElevation` 0 and `sheetShadowElevation` = `BottomSheetDefaults.Elevation`; 262 to 322: the `Surface` with `widthIn(max = sheetMaxWidth)`, `requiredHeightIn(min = peekHeight)` (270) and `shadowElevation` (322)).
- `compose/material3/material3/src/commonMain/kotlin/androidx/compose/material3/SheetDefaults.kt` (lines 373 to 402: `BottomSheetDefaults`, `ExpandedShape`, `ContainerColor`, `Elevation`, `ScrimColor`, `SheetPeekHeight` 56, `SheetMaxWidth` 640 and `windowInsets`; 410 to 431: `DragHandle`, the shape `MaterialTheme.shapes.extraLarge`, the token color and the `padding(vertical = DragHandleVerticalPadding)`; 543: `DragHandleVerticalPadding` 22).
- `compose/material3/material3/src/commonMain/kotlin/androidx/compose/material3/tokens/SheetBottomTokens.kt` (lines 24 to 31: container `SurfaceContainerLow`, shape `CornerExtraLargeTop`, handle `OnSurfaceVariant` of 32 × 4, `DockedMinimizedContainerShape` `CornerNone`, `Level1` elevations of the modal and the standard), `ShapeTokens.kt` (lines 31 to 37: `CornerExtraLargeTop`, 28 on top and 0 on the bottom) and `ElevationTokens.kt` (`Level1` 1 dp).
- `compose/material3/material3/src/commonMain/kotlin/androidx/compose/material3/ListItem.kt` and `tokens/ListTokens.kt`, for the items (see `list-item.md`): `Surface` container (`ListItemContainerColor`, line 27), one-line height 56 (line 62), title in `BodyLarge` and `OnSurface`, 24 leading icon in `OnSurfaceVariant` (lines 54 and 55), padding of 16 (`ListItemStartPadding`) and 16 to the text (`LeadingContentEndPadding`).
- `compose/material3/material3/src/commonMain/kotlin/androidx/compose/material3/tokens/TypeScaleTokens.kt` (`TitleLarge` 22/28/400/0 and `BodyLarge` 16/24/400/0.5).

**How the drawing follows Compose**

- Sheet in `surface-container-low` with the top corners of 28 (`CornerExtraLargeTop`, the `corner-extra-large`) and the bottom ones square. The modal casts no shadow (its `Level1` is only `tonalElevation`, which does not paint when the color is not `surface`), and the standard has the level 1 shadow (`sheetShadowElevation`, the two level 1 shadows (point: `y` 1, `blur` 2; ambient: `y` 1, `blur` 3, `spread` 1; tokens `elevation-1-point-*` and `elevation-1-ambient-*`)).
- 32 × 4 handle in `on-surface-variant` with the `corner-extra-large` shape (the capsule of `shapes.extraLarge`), in a 48 area (22 + 4 + 22), centered. The color is solid: the commit's `DragHandle` uses the token without the 0.4 opacity that the drawing had. With `dragHandle: false` the area disappears.
- Title in `title-large` (22/28, weight 400) in `on-surface` and one row per item as a one-line `ListItem`: 56 minimum height, `surface` container, 24 icon from the set in `on-surface-variant` 16 from the edge, 16 to the label and label in `body-large` (16/24) in `on-surface`, on a single line with `…` (the `list-item` convention). An item without an icon starts at 16.
- Maximum width of 640 (`SheetMaxWidth`, the root's `maxWidth`) and, in the standard, a minimum height of `sheetPeekHeight` (`requiredHeightIn(min = peekHeight)`, the root's `minHeight` read from the field). The modal has no minimum height.
- Single-line label centered by the capital letter (`cap-middle`): the `label` node of each item (the `title` stays as it is) uses `font.verticalAlign: "cap-middle"` and stays `hug` in height, because the parent also measures by the text; the text box is the line, centered in the parent. Compose's `Text` centers by the font's line box (ascent and descent); the drawing centers the capital height in the box, and with Roboto the two coincide to within 1 px.

**What still differs from Compose**

- The sheet content is free-form (`ColumnScope.() -> Unit`): the title, its spacing and the bottom one are not constants of the composable. The drawing uses 16 on the sides of the title (the `ListItemStartPadding`), 8 on top and 16 at the bottom, and 16 of breathing room below the list in place of `contentWindowInsets` (the system bar), which are drawing conventions and not code values.
- A `ListItem` without `colors` paints the container in `surface`, and that is what the drawing does; the strip is slightly lighter than the `surface-container-low` sheet. Whoever passes `ListItemDefaults.colors(containerColor = Color.Transparent)` does not see the strip, and the type has no field for that.
- The top corners are the list `[corner-extra-large, corner-extra-large, 0, 0]` (the radius list accepts `$token` per item), so they follow the token if the specialization changes.
- The standard's shadow is the two level 1 ones (point at 30% and ambient at 15%, through the tokens `elevation-1-point-*` and `elevation-1-ambient-*`); Compose's tonal one is not drawn. At 1 dp they barely show at the top of the sheet.
- The drawing is the open, static state: no `scrim` (the 32% `scrim` film, from the composable), no dragging, no collapsed, partial and hidden states (the `CornerNone` shape of `DockedMinimizedContainerShape` is not drawn), no handle tooltip (`DragHandleWithTooltip`), no animation and no system inset.
- The collapsed standard does not cut the content at the height of `sheetPeekHeight`: Compose shows only that part of the sheet, and the drawing shows all of it, with that height as the minimum.

- `SheetBottomTokens.kt` defines `FocusIndicatorColor` (line 32), but the type has no `interaction`: the focus ring is not drawn.
