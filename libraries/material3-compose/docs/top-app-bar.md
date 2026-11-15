# Top app bar

Top bar of the screen with title, navigation icon and actions. Small is the default; Center centers the title; Medium and Large have a large title that collapses on scroll.

Annotation type: `top-app-bar` (layer Components).

## Fields

| Key                         | Label                       | Type   | Required | Options                                                   | Default | Description                                                                                                                               |
| --------------------------- | --------------------------- | ------ | -------- | --------------------------------------------------------- | ------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `title`                     | Title                       | string | yes      |                                                           |         | Screen title.                                                                                                                             |
| `style`                     | Style                       | enum   | no       | `small`, `center`, `medium`, `large`                      | `small` | small, center (centered title), medium or large (large title on two lines).                                                               |
| `navigationIcon`            | Navigation icon             | string | no       | free text; icon suggestions (`Home`, `Search`, `Person`…) |         | Icon on the left (Menu or ArrowBack, for example). Empty = no icon.                                                                       |
| `navigationIconDescription` | Navigation icon description | string | no       | free text                                                 |         | Accessible name of the navigation icon (it is an action): what a screen reader reads ("Search", "Open the menu"). Empty = a pending item. |
| `actionIcon1`               | Action 1                    | string | no       | free text; icon suggestions (`Home`, `Search`, `Person`…) |         | First action icon on the right. Empty = no action.                                                                                        |
| `actionIcon1Description`    | Action 1 description        | string | no       | free text                                                 |         | Accessible name of action 1 (it is an action): what a screen reader reads ("Search", "Open the menu"). Empty = a pending item.            |
| `actionIcon2`               | Action 2                    | string | no       | free text; icon suggestions (`Home`, `Search`, `Person`…) |         | Second action icon on the right. Empty = no action.                                                                                       |
| `actionIcon2Description`    | Action 2 description        | string | no       | free text                                                 |         | Accessible name of action 2 (it is an action): what a screen reader reads ("Search", "Open the menu"). Empty = a pending item.            |

## Compose

- Symbol: `androidx.compose.material3.TopAppBar`
- File (`path`): `compose/material3/material3/src/commonMain/kotlin/androidx/compose/material3/AppBar.kt`
- The `style` field chooses the symbol; values without their own case use the base one.

| `style`        | Symbol                   |
| -------------- | ------------------------ |
| `small` (base) | `TopAppBar`              |
| `center`       | `CenterAlignedTopAppBar` |
| `medium`       | `MediumTopAppBar`        |
| `large`        | `LargeTopAppBar`         |

How the annotation becomes the call (the values below are examples; the parameter names and expressions are those of `params` and `values` in `code`):

```kotlin
@OptIn(ExperimentalMaterial3Api::class)   // only if using scrollBehavior
@Composable
fun ScreenTopBar() {
    TopAppBar(    // style center: CenterAlignedTopAppBar, medium: MediumTopAppBar, large: LargeTopAppBar
        title = { Text("Home") },
        navigationIcon = {
            IconButton(onClick = { /* screen logic */ }) {
                Icon(Icons.Filled.Menu, contentDescription = "Menu")
            }
        },
        actions = {
            IconButton(onClick = { /* ... */ }) { Icon(Icons.Filled.Search, contentDescription = "Search") }
            IconButton(onClick = { /* ... */ }) { Icon(Icons.Filled.MoreVert, contentDescription = "More") }
        },
    )
}
```

`code` notes (what the tool hands to the agent):

> `title = { Text(<title>) }`; with `navigationIcon` filled, `navigationIcon = { IconButton(onClick = …) { Icon(Icons.Filled.<navigationIcon>, contentDescription = …) } }`, and each filled `actionIcon1`/`actionIcon2` becomes an `IconButton` inside `actions = { … }`. Since material3 1.4.0 the icons require `androidx.compose.material:material-icons-core` (or `-extended`) or a Material Symbol downloaded with `painterResource`; the ones that mirror (ArrowBack, KeyboardArrowRight, List) are in `Icons.AutoMirrored.Filled`. None of the four variants requires opt-in; only the `scrollBehavior` (`TopAppBarDefaults.pinnedScrollBehavior()` and relatives) requires `@OptIn(ExperimentalMaterial3Api::class)`.

## Examples

- **Default**: title=Home, style=small, navigationIcon=Menu, navigationIconDescription=Open the menu, actionIcon1=Search, actionIcon1Description=Search, actionIcon2=MoreVert, actionIcon2Description=More options
- **Centered**: title=Profile, style=center, navigationIcon=ArrowBack, navigationIconDescription=Back
- **Large**: title=Settings, style=large, navigationIcon=ArrowBack, navigationIconDescription=Back
- **Labeled actions**: title=Inbox, style=small, navigationIcon=Menu, navigationIconDescription=Open the menu, actionIcon1=Search, actionIcon1Description=Search, actionIcon2=MoreVert, actionIcon2Description=More options
- **Actions without a label**: title=Inbox, style=small, navigationIcon=Menu, actionIcon1=Search, actionIcon2=MoreVert

## Fidelity

Reference: Compose `material3` 1.4.0, commit `5113b82a4ed6416d6344efa50e41db8cb65928ff` (decisions 1 to 3 of the faithful Material 3 stage). 1 dp = 1 component unit; the container density converts it to image pixels (`docs/COMPONENT-FORMAT.md`, "Units and density"). The values come from the specialization tokens (`tokens`, in the `light` and `dark` modes), which mirror the androidx token files; no color, font or radius is literal in the component, no text node declares `family` (all inherit `font-sans`) and the icons are the `icon` node of the library set, chosen by the field's `$switch` (no SVG path in the component).

**Files used**

- `compose/material3/material3/src/commonMain/kotlin/androidx/compose/material3/AppBar.kt` (lines 160 to 440: `TopAppBar` and `CenterAlignedTopAppBar`, `titleHorizontalAlignment` `Start` or `CenterHorizontally`; 508 to 560 and 753 to 800: `MediumTopAppBar` and `LargeTopAppBar`, with `titleBottomPadding` and the token fonts; 1509 to 1520: `defaultTopAppBarColors`; 1812 to 1832: the heights 64, 112 and 152; 2509 to 2600: the single-row bar; 2731 to 2840: the two rows, with the small title at alpha 0 when expanded; 2976 to 3254: `TopAppBarLayout` and `TopAppBarMeasurePolicy`, the `Box` on each side with `TopAppBarHorizontalPadding`, the title between the navigation and the actions, the `start = max(TopAppBarTitleInset, navigationIcon.width)`, the center relative to the whole bar and the title baseline on both rows; 3510 to 3516: `MediumTitleBottomPadding` 24, `LargeTitleBottomPadding` 28, `TopAppBarHorizontalPadding` 4 and `TopAppBarTitleInset` 12).
- `compose/material3/material3/src/commonMain/kotlin/androidx/compose/material3/tokens/AppBarSmallTokens.kt` (`ContainerHeight` 64, `TitleFont` `TitleLarge`), `AppBarMediumTokens.kt` (112, `HeadlineSmall`), `AppBarLargeTokens.kt` (152, `HeadlineMedium`) and `AppBarTokens.kt` (`ContainerColor` `Surface`, `LeadingIconColor` and `TitleColor` `OnSurface`, `TrailingIconColor` `OnSurfaceVariant`, `IconSize` 24).
- `compose/material3/material3/src/commonMain/kotlin/androidx/compose/material3/tokens/TypographyTokens.kt` (lines 269 and 270: `LineHeightStyle` with `Alignment.Center` and `Trim.None` across the whole typography).
- `compose/material3/material3/samples/src/main/java/androidx/compose/material3/samples/AppBarSamples.kt` (lines 82, 251, 407 and 475: the title in the official examples of each style carries `maxLines = 1` and `overflow = TextOverflow.Ellipsis`).

**How the drawing follows Compose**

- 64 bar (`AppBarSmallTokens.ContainerHeight`) in `surface`. Medium and large have the same 64 top row (navigation and actions); the large title sits on the bottom row, which the `Column` of the `TwoRowsTopAppBar` puts under it. The total height is that of the marking rectangle: 64, 112 or 152. The `sizing.height` is the expression by `style` (`$switch`: small and center 64, medium 112, large 152, and 64 without `style`, the small default), so the new bar, **Arrange** and `fit_marking` take the marking to the style height; the `size` (412 × 152, the large one) only applies as the starting size of an instance with a rectangle.
- Navigation: 48 `IconButton` with the 24 icon in `on-surface`, 4 from the edge (the `padding(start = TopAppBarHorizontalPadding)` of the `Box`). Actions: 48 areas flush right, with a 4 margin (the `padding(end = 4)` of the `Box`), 24 icons in `on-surface-variant`. The row is a `row` with padding 4 and no `gap`, like the Compose actions `Row`.
- Small title: `title-large` (22/28, weight 400, spacing 0) in `on-surface`, centered in the bar height by the cap height (`cap-middle`, the node takes the 64; the 28 line box would sit at `(64 - 28) / 2` = 18). It starts at 56 with navigation (4 + 48 + 4 of the title `Box`) and at 16 without it (`TopAppBarTitleInset` 12 + 4), and ends 8 from whatever comes before the actions (4 of the title `Box` and 4 of the actions margin). One line only, with `…` at the end (`font.wrap: "none"`, `ellipsis`, `maxLines: 1`), like the `Text(maxLines = 1, overflow = Ellipsis)` of the official examples.
- Centered: the same title, with `font.align: "center"`, centered in the width of the whole bar and not only in the gap between the navigation and the actions, like `titleHorizontalAlignment = CenterHorizontally`: the margins on both sides are equal and equal the larger of the start (52 with navigation, 12 without) and the end (4 plus 48 per action) plus the 4 of the title `Box`. The space is reserved by an expression in the `padding` of the title frame.
- Medium and large: title in `headline-small` (24/32) and `headline-medium` (28/36), 16 from the edge, with `…` at the end like the small one. Compose puts the last baseline of the title at `titleBottomPadding` from the bottom of the bar, `MediumTitleBottomPadding` 24 and `LargeTitleBottomPadding` 28 (`AppBar.kt` lines 3510 and 3511, passed on lines 524 and 768 and used on lines 3213 to 3231: `titleY = layoutHeight - titlePlaceable.height - (titleBottomPadding - (height - baseline))`). The `large title` node carries `baselinePadding.bottom` 24 (medium) and 28 (large) and the bottom anchor 0, so the baseline sits at those values from the bottom in any font, not only Roboto (the earlier computation, a text box 16 and 20 from the bottom, held for the Roboto 14/20 descent).
- The small and the centered title take the bar height (`height: "fill"`) and center by the cap height (`font.verticalAlign: "cap-middle"`); the large title (medium and large) stays as it is. The Compose `Text` centers by the font line box; with Roboto the two coincide to within 1 px.

**Slots (named, `formatVersion` 17)**

- `navigationIcon` (`() -> Unit`, `AppBar.kt` lines 160 to 440 and `TopAppBarLayout`, lines 2976 to 3254, where the `Box` of each side takes `TopAppBarHorizontalPadding`) is a slot with a 48 high hug box that takes one `icon-button` or `icon`, at the start; `actions` (`RowScope.() -> Unit`, same lines) is a hug slot at the end that takes `icon-button`, `icon-toggle-button` and `icon`. The compose commit is `5113b82a4ed6416d6344efa50e41db8cb65928ff`. The `title` stays a field.
- A child in a slot replaces the default content: with a child in `navigationIcon` the `navigationIcon` field icon is not drawn, with children in `actions` the `actionIcon1` and `actionIcon2` icons are not, and the `get_code_hints` writes `navigationIcon = { ... }` and `actions = { ... }` with the children. Without children the drawing is the one of before; the title keeps the margins computed from the fields, so a child that is wider than 48 does not push it.
- The children have no `weight`; the slot's `layout` only places the children side by side (see `docs/COMPONENT-FORMAT.md`, "Known limits").

**What still differs from Compose**

- The `size` is 412 × 152, the `ContainerHeight` of the large (`AppBarLargeTokens.kt` line 25; the medium is 112, line 25 of `AppBarMediumTokens.kt`, and the small, 64, line 25 of `AppBarSmallTokens.kt`), the starting size; the height that the fit action gives comes from `sizing` by `style`. The effect of #863 (the small and centered bar with 64 at the top and the leftover 88 below, with only the `surface` background) remains only on a marking that already exists at 152 and whose `style` changes: the fit (Arrange, `fit_marking`) takes the height to the style, but editing the `style` does not touch the rectangle.
- No inset and collapse on scroll (`scrollBehavior`), no `surface-container` color for when the content passes underneath and no small title that appears on collapse: the drawing is the expanded bar.
- The title has `maxLines = 1` and `…` as in the official examples; the type's `code` (`Text(<title>)`) does not pass them, and without them the Compose `Text` wraps onto several lines.
- A title so long that it fills the whole gap gets, in Compose, an 8 shift to the left (the title `Box`, with 12 at the start, goes past `width - end` and is pushed); the drawing truncates the text at the computed margin. On the centered one, a title larger than the symmetric gap but that fits the asymmetric gap is pushed to one side in Compose; here it is truncated with `…`.
- The icons are only those of the library set (`icons`); the Compose 48 `IconButton` has the `Icons.Filled` icon of the same name, without the mirroring ones (`AutoMirrored`), and without pressed, focused and hovered states.
- No `windowInsets` (the status bar), which is not a field of the type; `expandedHeight`, `collapsedHeight` and `scrolledContainerColor` are fields and code, but the drawing does not use them. The `subtitle` is only drawn in the `small` style.

**Accessibility** (stage #1081; the unit is the dp, 1 dp = 1 component unit): the type has no `accessibility.role` of its own; the `navigationIcon`, `actionIcon1` and `actionIcon2` are `button` parts, each named by its optional description field (`navigationIconDescription`, `actionIcon1Description`, `actionIcon2Description`). An icon without a description is a pending item on its part (`accessible-label-missing`); the "Labeled actions" example has them filled and "Actions without a label" is the deliberate one.
