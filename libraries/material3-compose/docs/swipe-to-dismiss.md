# SwipeToDismissBox

Item dismissed by swiping to one side or the other, revealing a background with an icon (delete, archive). Use it on list items.

Annotation type: `swipe-to-dismiss` (layer Components).

## Fields

| Key                           | Label                     | Type   | Required | Options                                                   | Default   | Description                                                                                                                                                      |
| ----------------------------- | ------------------------- | ------ | -------- | --------------------------------------------------------- | --------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `title`                       | Title                     | string | yes      |                                                           |           | Main line of the dismissable item (the content belongs to the app; the drawing shows a list item).                                                               |
| `supportingText`              | Supporting text           | string | no       |                                                           |           | Supporting line below the title. Empty = no line.                                                                                                                |
| `direction`                   | Swipe state               | enum   | no       | `Settled`, `StartToEnd`, `EndToStart`                     | `Settled` | Settled is the item at rest; StartToEnd and EndToStart show the swiped item and the revealed background (SwipeToDismissBoxValue).                                |
| `enableDismissFromStartToEnd` | Dismiss from start to end | enum   | no       | `true`, `false`                                           | `true`    | false prevents swiping in the reading direction (enableDismissFromStartToEnd).                                                                                   |
| `enableDismissFromEndToStart` | Dismiss from end to start | enum   | no       | `true`, `false`                                           | `true`    | false prevents swiping against the reading direction (enableDismissFromEndToStart).                                                                              |
| `icon`                        | Background icon           | string | no       | free text; icon suggestions (`Home`, `Search`, `Person`…) |           | Icon of the revealed background (the drawing shows Delete, Done, Check, Favorite, Edit, Star, Share, Add and Close; others fall back to Delete). Empty = Delete. |
| `width`                       | Width                     | enum   | no       | `wrap`, `fill`, `fixed`                                   | `wrap`    | wrap fits the content, fill takes all the available width and fixed uses the marking width (dp).                                                                 |
| `height`                      | Height                    | enum   | no       | `wrap`, `fill`, `fixed`                                   | `wrap`    | wrap fits the content, fill takes all the available height and fixed uses the marking height (dp).                                                               |
| `weight`                      | Weight                    | number | no       |                                                           |           | Share of the leftover space in a Row or Column (Modifier.weight). Empty = no weight.                                                                             |

## Compose

- Symbol: `androidx.compose.material3.SwipeToDismissBox`
- File (`path`): `compose/material3/material3/src/commonMain/kotlin/androidx/compose/material3/SwipeToDismissBox.kt`
- Stable at the pinned commit, no opt-in.

How the annotation becomes the call (the values below are examples; the parameter names and expressions are those of `params` and `values` in `code`):

```kotlin
val state = rememberSwipeToDismissBoxState(
    initialValue = SwipeToDismissBoxValue.Settled,    // direction
)

SwipeToDismissBox(
    state = state,
    enableDismissFromStartToEnd = false,              // enableDismissFromStartToEnd
    enableDismissFromEndToStart = true,               // enableDismissFromEndToStart
    onDismiss = { value -> /* remove the item from the list */ },
    backgroundContent = {
        Box(
            Modifier.fillMaxSize().background(MaterialTheme.colorScheme.errorContainer).padding(horizontal = 24.dp),
            contentAlignment = if (state.dismissDirection == SwipeToDismissBoxValue.StartToEnd)
                Alignment.CenterStart else Alignment.CenterEnd,
        ) {
            Icon(Icons.Filled.Delete, contentDescription = null)    // icon
        }
    },
) {
    ListItem(headlineContent = { Text("Team meeting") })    // title, supportingText
}
```

`code` notes (what the tool hands to the agent):

> Stable, no opt-in. Use the overload with `onDismiss` (the one that only takes `content` and `backgroundContent` and reads `state.currentValue` is `@Deprecated`). `state = rememberSwipeToDismissBoxState(initialValue = <direction>)`: the `direction` field is the `initialValue` of the state (it is not a `SwipeToDismissBox` parameter) and usually stays at `Settled`; the two `enableDismiss…` are box parameters. `onDismiss = { value -> … }` removes the item (the app handles `StartToEnd` and `EndToStart`). `backgroundContent` (a `RowScope`) is the revealed background: a `Box(Modifier.fillMaxSize().background(<color>).padding(horizontal = 24.dp), contentAlignment = if (state.dismissDirection == SwipeToDismissBoxValue.StartToEnd) Alignment.CenterStart else Alignment.CenterEnd) { Icon(Icons.Filled.<icon>, contentDescription = null) }`; the background colors belong to the app. The `content` (a `RowScope`) is the item, usually a `ListItem` or `Card` (the child marking, or what the app already has). Size: `fill` becomes `Modifier.fillMaxWidth()`/`fillMaxHeight()`, `fixed` becomes `Modifier.width(<marking width>.dp)`/`height(<marking height>.dp)` and `weight` becomes `Modifier.weight(<weight>f)` (only inside Row, Column or FlowRow).

## Drawing

The drawing shows the swipe state: at rest (`Settled`) only the item; in `StartToEnd` the item moves 56 (the `positionalThreshold`) toward the end and reveals the primary container background with the icon at the start; in `EndToStart` it moves 56 toward the start and reveals the error container with the icon at the end. A disabled direction (`enableDismiss…` false) reveals nothing, and the drawing goes back to rest. The background colors are illustrative: Compose leaves the `backgroundContent` color to the app.

## Examples

- **Resting**: title=Team meeting, supportingText=Today, 2:00 PM, direction=Settled, icon=Delete, width=fill
- **Delete by dragging to the start**: title=Team meeting, supportingText=Today, 2:00 PM, direction=EndToStart, enableDismissFromStartToEnd=false, icon=Delete, width=fill
- **Complete by dragging to the end**: title=Invitation from Ana, direction=StartToEnd, enableDismissFromEndToStart=false, icon=Done, width=fill

## Fidelity

Reference: Compose `material3` 1.4.0, commit `5113b82a4ed6416d6344efa50e41db8cb65928ff` (decisions 1 to 3 of the faithful Material 3 stage). 1 dp = 1 component unit; the container density converts it to image pixels (`docs/COMPONENT-FORMAT.md`, "Units and density"). The values come from the specialization tokens (`tokens`, in the `light` and `dark` modes), which mirror the androidx token files; no color, font, radius or color opacity is literal in the component and no text node declares `family` (all inherit `font-sans`). The `SwipeToDismissBox` only defines the gesture and the offset (`positionalThreshold` of 56): the revealed background and the item belong to the app, and the drawing illustrates them with the Material tokens (the item is a `ListItem`, the background uses the Material `container` roles).

**Files used**

- `compose/material3/material3/src/commonMain/kotlin/androidx/compose/material3/SwipeToDismissBox.kt` (lines 44 to 53: `SwipeToDismissBoxValue`; 305 to 357: `SwipeToDismissBox`, the `Box` with `anchoredDraggable`, the `Row(content = backgroundContent, Modifier.matchParentSize())` (331) behind the content `Row` and the `DraggableAnchors` with `Settled at 0`, `StartToEnd at width` and `EndToStart at -width` (337 to 349); 360 to 364: `SwipeToDismissBoxDefaults.positionalThreshold` of 56 dp; 393: `DismissVelocityThreshold` 125 dp).
- `compose/material3/material3/src/commonMain/kotlin/androidx/compose/material3/ListItem.kt` and `tokens/ListTokens.kt` (the drawn item: the `surface` `Surface` with no corner, 16 side padding and 8 above and below, title in `BodyLarge` and support text in `BodyMedium`; see `docs/list-item.md`), `tokens/TypeScaleTokens.kt` (`BodyLarge` 16/24/400/0.5 and `BodyMedium` 14/20/400/0.2).

**How the drawing follows Compose**

- At rest only the item appears, in `surface` over the box. In `StartToEnd` and `EndToStart` the item moves 56 (the `positionalThreshold`, the distance from which the gesture settles in the direction) to the side and reveals the background behind it, behind the `backgroundContent`: before, the drawing used 80, which does not come from Compose. A disabled direction (`enableDismiss…` false) does not exist as an anchor, so the drawing goes back to rest.
- Revealed background: `primary-container` in the start-to-end direction, with the icon in `on-primary-container`; `error-container` in the opposite direction, with the icon in `on-error-container` (the type's `code` uses the theme's `errorContainer`; the background colors belong to the app). 24 icon, 24 from the edge (the `padding(horizontal = 24.dp)` of the `code` `backgroundContent`), centered in the height, on the side the item moved away from: `Alignment.CenterStart` or `CenterEnd`.
- Item as a `ListItem`: title in `body-large` (16/24) in `on-surface` and support text in `body-medium` (14/20) in `on-surface-variant`, both on one line with `…` (`maxLines` 1 and `ellipsis`), 16 from the edges and centered in the height of 72.
- The icon is the `icon` node of the library set, by the Compose name (`Delete`, `Done`…): an empty field is `delete` (the default the field already had) and a name outside the list falls back to the placeholder and warns `unknown icon`, instead of silently going back to `Delete`.
- The box clips what leaves it (`clip`).

**Slots (named, `formatVersion` 17)**

- `content` (`RowScope.() -> Unit`, `SwipeToDismissBox.kt` lines 305 to 357) is the whole item, which moves with the swipe (its box is shifted by 56 to the side that the `direction` reveals); `backgroundContent` (`RowScope.() -> Unit`, line 331, the `Row(content = backgroundContent, Modifier.matchParentSize())`) is a 56 wide strip on the side that the item left, visible only when the swipe is enabled in that direction. The compose commit is `5113b82a4ed6416d6344efa50e41db8cb65928ff`.
- A child in `content` replaces the item with `title` and `supportingText`; a child in `backgroundContent` replaces the `icon` field's icon; the `get_code_hints` writes `content = { ... }` and `backgroundContent = { ... }`. Without children the drawing is the one of before.
- The children have no `weight`; the strip is 56 wide, not the whole width that Compose gives the `Row` (the background that the item leaves uncovered).

**What still differs from Compose**

- In Compose the item only settles outside the box (`EndToStart at -width`, `StartToEnd at width`), and the 56 is the gesture threshold: the drawn frame is that of a 56 drag, not a settled state. Once settled in `StartToEnd` or `EndToStart`, the `onDismiss` runs and the app removes the item.
- The item is always a `ListItem` with title and support text (one line each); the default content is the `ListItem` of the fields and the Compose `content` takes anything (a `Card`, a `ListItem` with icons): a child marking in the `content` slot, and the background color change with the gesture progress (`state.dismissDirection`, `progress`) belongs to the app.
- Long support text ends in `…` on one line, which keeps the item at 72; the three-line `ListItem` (88) is not drawn.
- No gesture, no animation, no dismiss velocity (`DismissVelocityThreshold`), no `onDismiss` and no focused or pressed state; `gesturesEnabled` is a field and code, but the drawing does not use it.
