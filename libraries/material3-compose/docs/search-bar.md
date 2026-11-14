# Search bar

Search bar. Bar is the bar that expands to the full screen; docked opens the results right below the field (wide screens).

Annotation type: `search-bar` (layer Components).

## Fields

| Key            | Label         | Type   | Required | Options                                                   | Default | Description                                                                                                                                                                                                                        |
| -------------- | ------------- | ------ | -------- | --------------------------------------------------------- | ------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `query`        | Query         | string | no       |                                                           |         | Text typed in the search. Empty = shows the hint (placeholder).                                                                                                                                                                    |
| `placeholder`  | Hint          | string | no       |                                                           |         | Hint text when the query is empty.                                                                                                                                                                                                 |
| `leadingIcon`  | Leading icon  | string | no       | free text; icon suggestions (`Home`, `Search`, `Person`…) |         | Icon before the text (usually Search). Empty = no icon.                                                                                                                                                                            |
| `trailingIcon` | Trailing icon | string | no       | free text; icon suggestions (`Home`, `Search`, `Person`…) |         | Icon after the text (for example Close to clear). Empty = no icon.                                                                                                                                                                 |
| `expanded`     | Expanded      | enum   | no       | `true`, `false`                                           | `false` | true opens the search: the container gets the results divider (the child markings are the results).                                                                                                                                |
| `style`        | Style         | enum   | no       | `bar`, `docked`                                           | `bar`   | bar (SearchBar) or docked (DockedSearchBar).                                                                                                                                                                                       |
| `width`        | Width         | enum   | no       | `wrap`, `fill`, `fixed`                                   | `wrap`  | wrap fits the content, fill takes all the available width and fixed uses the marking width (dp).                                                                                                                                   |
| `height`       | Height        | enum   | no       | `wrap`, `fill`, `fixed`                                   | `wrap`  | wrap fits the content, fill takes all the available height and fixed uses the marking height (dp).                                                                                                                                 |
| `weight`       | Weight        | number | no       |                                                           |         | Share of the leftover space in a Row or Column (Modifier.weight). Empty = no weight.                                                                                                                                               |
| `interaction`  | Interaction   | enum   | no       | `none`, `hovered`, `focused`, `pressed`                   | `none`  | Resting appearance of the interaction state: hovered, focused or pressed; none = no state layer. It only changes the drawing and does not go into the code. The bar has no disabled state (no enabled): the state is always drawn. |

## Compose

- Symbol: `androidx.compose.material3.SearchBar`
- File (`path`): `compose/material3/material3/src/commonMain/kotlin/androidx/compose/material3/SearchBar.kt`
- The `style` field chooses the symbol; values without their own case use the base one.

| `style`      | Symbol            |
| ------------ | ----------------- |
| `bar` (base) | `SearchBar`       |
| `docked`     | `DockedSearchBar` |

How the annotation becomes the call (the values below are examples; the parameter names and expressions are those of `params` and `values` in `code`):

```kotlin
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun SearchField(query: String, onQueryChange: (String) -> Unit, expanded: Boolean, onExpandedChange: (Boolean) -> Unit) {
    SearchBar(    // style docked: DockedSearchBar
        inputField = {
            SearchBarDefaults.InputField(
                query = query,
                onQueryChange = onQueryChange,
                onSearch = { /* screen logic */ },
                expanded = expanded,
                onExpandedChange = onExpandedChange,
                placeholder = { Text("Search songs") },
                leadingIcon = { Icon(Icons.Filled.Search, contentDescription = null) },
                trailingIcon = { Icon(Icons.Filled.Close, contentDescription = null) },
            )
        },
        expanded = expanded,
        onExpandedChange = onExpandedChange,
    ) {
        /* results: the child markings */
    }
}
```

`code` notes (what the tool hands to the agent):

> Requires @OptIn(ExperimentalMaterial3Api::class): the whole SearchBar family is experimental at the pinned commit. Use the `SearchBar(inputField, expanded, onExpandedChange, …, content)` overload; the overloads with `query` and `active` are `@Deprecated`. The field goes in `inputField = { SearchBarDefaults.InputField(query = <query>, onQueryChange = …, onSearch = …, expanded = <expanded>, onExpandedChange = …, placeholder = { Text(<placeholder>) }, leadingIcon = { Icon(Icons.Filled.<leadingIcon>, contentDescription = null) }, trailingIcon = { Icon(Icons.Filled.<trailingIcon>, contentDescription = null) }) }`, with `query` and `expanded` bound to screen states; `placeholder`, `leadingIcon` and `trailingIcon` are only included when filled. The child markings (results and suggestions) go in `content = { … }` (a Column), which only appears with `expanded = true`. Size: `fill` becomes `Modifier.fillMaxWidth()`/`fillMaxHeight()`, `fixed` becomes `Modifier.width(<marking width>.dp)`/`height(<marking height>.dp)` and `weight` becomes `Modifier.weight(<weight>f)` (only inside Row, Column or FlowRow).

`docked` variant: Requires the same @OptIn(ExperimentalMaterial3Api::class). `DockedSearchBar(inputField, expanded, onExpandedChange, …, content)` takes the same `inputField` (`SearchBarDefaults.InputField(query = <query>, …, expanded = <expanded>, …)`) and the same `content`, but the results open in a panel right below the field, with 28 corners, instead of taking the screen: it is meant for wide screens (tablet and desktop). `placeholder`, `leadingIcon` and `trailingIcon` stay as in the base.

## Examples

- **Bar with hint**: placeholder=Search songs, leadingIcon=Search, style=bar
- **With query**: query=jazz, placeholder=Search songs, leadingIcon=Search, trailingIcon=Close, style=bar
- **Expanded docked**: query=jaz, placeholder=Search, leadingIcon=Search, trailingIcon=Close, expanded=true, style=docked
- **Hovered**: placeholder=Search, leadingIcon=Search, interaction=hovered
- **Focused**: query=coffee, leadingIcon=Search, interaction=focused
- **Pressed**: placeholder=Search, leadingIcon=Search, trailingIcon=Mic, interaction=pressed

## Fidelity

Reference: Compose `material3` 1.4.0, commit `5113b82a4ed6416d6344efa50e41db8cb65928ff` (decisions 1 to 3 of the faithful Material 3 stage). 1 dp = 1 component unit; the container density converts it to image pixels (`docs/COMPONENT-FORMAT.md`, "Units and density"). The values come from the specialization tokens (`tokens`, in the `light` and `dark` modes), which mirror the androidx token files; no color, font or radius is literal in the component, and no text node declares `family` (all inherit `font-sans`).

**Files used**

- `compose/material3/material3/src/commonMain/kotlin/androidx/compose/material3/SearchBar.kt` (lines 1023 to 1048: `TonalElevation` and `ShadowElevation` at level 0, `InputFieldHeight`, `inputFieldShape` and `dockedShape`; 1178 to 1240: `inputFieldColors`; 1340 to 1410: the field with `sizeIn(minHeight = 56)`, `TextFieldLineLimits.SingleLine`, `contentPaddingWithoutLabel` and the icons offset by `SearchBarIconOffsetX`; 2118 to 2150: the expanded `bar` with the `HorizontalDivider`; 2199 to 2290: the `SearchBarLayout`, with 8 of breathing room above and below the field; 2315 to 2350: the `DockedSearchBarLayout`, with the divider right below the field; 2711 to 2716: `SearchBarMinWidth` 360, `SearchBarMaxWidth` 720, `SearchBarVerticalPadding` 8 and `SearchBarIconOffsetX` 4).
- `compose/material3/material3/src/commonMain/kotlin/androidx/compose/material3/tokens/SearchBarTokens.kt` (`ContainerColor` `SurfaceContainerHigh`, `ContainerHeight` 56, `ContainerShape` `CornerFull`, `InputTextColor`, `LeadingIconColor`, `TrailingIconColor`, `SupportingTextColor`, fonts `BodyLarge`) and `tokens/SearchViewTokens.kt` (`DividerColor` `Outline`, `DockedContainerShape` `CornerExtraLarge`, `FullScreenHeaderContainerHeight` 72).
- `compose/material3/material3/src/commonMain/kotlin/androidx/compose/material3/tokens/SearchBarTokens.kt` (lines 28 to 35: `ContainerShape`, `FocusIndicatorColor`, `HoverSupportingTextColor` and `PressedSupportingTextColor`).
- `compose/material3/material3/src/commonMain/kotlin/androidx/compose/material3/tokens/StateTokens.kt` (lines 22 to 25: `HoverStateLayerOpacity`, `FocusStateLayerOpacity`, `PressedStateLayerOpacity`; `DraggedStateLayerOpacity` 0.16 is the `state-dragged`).

**How the drawing follows Compose**

- **Root width limits:** `minWidth` 360 and `maxWidth` 720, and the `docked` style fixes both at 360. They come from the field's `sizeIn(minWidth = SearchBarMinWidth, maxWidth = SearchBarMaxWidth, minHeight = InputFieldHeight)` (`SearchBar.kt` lines 1356 to 1360, 1542 to 1546 and 1677 to 1681), from `SearchBarMinWidth` 360 and `SearchBarMaxWidth` 720 (lines 2712 and 2713) and from the `DockedSearchBar`, which uses `width(SearchBarMinWidth)` (line 665). They apply when the width is measured (`measureComponent`, the fit with free width): the bar never goes below 360.
- **`sizing.width`:** the `docked` style is 360 wide (one expression per `style`), so the new instance and the screen arranged by `layoutScreen` draw it with the Compose width; the `bar` follows `fill`, like the Compose bar, which takes the parent width (`fillMaxWidth` of the field, line 1971, inside the `sizeIn`).
- Container 56 high (`minHeight` of the field row) in the `corner-full` shape, color `surface-container-high`, no shadow (`ShadowElevation` is level 0) and no outline.
- Leading icon `on-surface` and trailing icon `on-surface-variant`, 24 by the `icon` node, 16 from the edges; the text starts at 52 (48 icon area plus 4 of `SearchBarIconOffsetX`), with 12 between the icon and the text.
- Query in `body-large` (16/24, 0.5), `on-surface`, on a single line (`font.wrap: "none"`, `maxLines: 1`), clipped at the width, no ellipsis; hint in `body-large`, `on-surface-variant`.
- Expanded `docked`: radius `corner-extra-large` and a 1 divider in `outline` right below the field, at y = 56 (`HorizontalDivider` of the `DockedSearchBarLayout`).
- Expanded `bar` (full screen): radius `corner-none`, field 8 from the top and divider at y = 72 (8 + 56 + 8, the 72 header of `FullScreenHeaderContainerHeight`).
- The hint and the query (one line) are centered by the cap height (`font.verticalAlign: "cap-middle"`). The Compose `Text` centers by the font line box; with Roboto the two coincide to within 1 px.

**Interaction state (`interaction` field)**

The field chooses the resting appearance of a state; it does not go into the `code` or the `variants`. The options are `none` and the states that `SearchBarTokens.kt` names: `hovered` (`HoverSupportingTextColor`, line 31), `focused` (`FocusIndicatorColor`, line 30) and `pressed` (`PressedSupportingTextColor`, line 35). **This type has no `enabled`**, so there is no disabled state that wins: the state is always drawn.

- **State layer:** the `state` node is a `rect` the size of the bar (56) and with the component radius, behind the content, in the typed text color, `on-surface` (`InputTextColor`, line 32), with `opacity` from the `state-hover` (0.08), `state-focus` (0.10) and `state-pressed` (0.10) tokens. The bar tokens **do not name** a state layer color or opacity: it is the `card` convention (the content color) and the M3 drawing, not a frame that the Compose 1.4.0 `SearchBar` draws.
- **Content colors:** `HoverSupportingTextColor` and `PressedSupportingTextColor` repeat `on-surface-variant`, the usual role; nothing else changes in the text or the icons.
- **Expanded:** the layer covers only the input row (56), not the list below.

**What still differs from Compose**

- The `interaction` is a still frame: no cursor and no expand animation. In `focused` the field gets, besides the state layer, the focus ring (`FocusIndicatorColor`, `secondary`, `SearchBarTokens.kt` line 30): the 3 ring in `secondary`, offset 2 from the shape (`stroke.offset`), outside the box (the width and the offset are from the stage decision; `*Tokens.kt` only provides the color), around the 56 row. On the expanded `docked` bar the layer takes the component radius, not only the top corners.
- The expanded Compose `bar` takes the screen and adds the `WindowInsets` to the top breathing room; here the size is the marking size and the breathing room is just the fixed 8.
- On a marking with a rectangle the root fills the box, so the root `minWidth` and `maxWidth` do not change the drawing, and the app's Arrange keeps the marking width (the 720 cap of the `bar` and the 360 of the `docked` are not imposed on it; only the instance without a rectangle gets the 360 of the `docked`). The 720 `maxWidth` also does not act on the `bar`, whose width is `fill` (no engine path applies the root limit to a `fill` axis).
- The initial size of 56 does not fit the expanded bar: the divider sits on the last pixel of the box (y = 55) and moves down to the Compose y = 56 (docked) or 72 (bar) when the marking grows to hold the results.
- The hint wraps by word (the placeholder `Text` does not limit lines); Compose also lets it grow the field.
- Without the disabled state (`enabled`), the `onSearch` and the `SearchBar` avatar: they are not fields of the type.
