# Bottom app bar

Bar at the bottom of the screen with up to four icon actions and, optionally, a floating action button (FAB) embedded on the right. In a Scaffold it goes in bottomBar.

Annotation type: `bottom-app-bar` (Components layer).

## Fields

| Key                               | Label                       | Type   | Required | Options                                                   | Default | Description                                                                                                                               |
| --------------------------------- | --------------------------- | ------ | -------- | --------------------------------------------------------- | ------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `actionIcon1`                     | Action 1                    | string | no       | free text; icon suggestions (`Home`, `Search`, `Person`…) |         | First action icon, on the left. Empty = no action.                                                                                        |
| `actionIcon1Description`          | Action 1 description        | string | no       | free text                                                 |         | Accessible name of action 1 (it is an action): what a screen reader reads ("Search", "Open the menu"). Empty = a pending item.            |
| `actionIcon2`                     | Action 2                    | string | no       | free text; icon suggestions (`Home`, `Search`, `Person`…) |         | Second action icon. Empty = no action.                                                                                                    |
| `actionIcon2Description`          | Action 2 description        | string | no       | free text                                                 |         | Accessible name of action 2 (it is an action): what a screen reader reads ("Search", "Open the menu"). Empty = a pending item.            |
| `actionIcon3`                     | Action 3                    | string | no       | free text; icon suggestions (`Home`, `Search`, `Person`…) |         | Third action icon. Empty = no action.                                                                                                     |
| `actionIcon3Description`          | Action 3 description        | string | no       | free text                                                 |         | Accessible name of action 3 (it is an action): what a screen reader reads ("Search", "Open the menu"). Empty = a pending item.            |
| `actionIcon4`                     | Action 4                    | string | no       | free text; icon suggestions (`Home`, `Search`, `Person`…) |         | Fourth action icon. Empty = no action.                                                                                                    |
| `actionIcon4Description`          | Action 4 description        | string | no       | free text                                                 |         | Accessible name of action 4 (it is an action): what a screen reader reads ("Search", "Open the menu"). Empty = a pending item.            |
| `floatingActionButton`            | Floating button             | string | no       | free text; icon suggestions (`Home`, `Search`, `Person`…) |         | Icon of the FAB embedded on the right (floatingActionButton parameter). Empty = no FAB.                                                   |
| `floatingActionButtonDescription` | Floating button description | string | no       | free text                                                 |         | Accessible name of the floating button (it is an action): what a screen reader reads ("Search", "Open the menu"). Empty = a pending item. |

## Compose

- Symbol: `androidx.compose.material3.BottomAppBar`
- File (`path`): `compose/material3/material3/src/commonMain/kotlin/androidx/compose/material3/AppBar.kt`

How the annotation becomes the call (the values below are examples; the parameter names and expressions are those of `params` and `values` in the `code`):

```kotlin
Scaffold(
    bottomBar = {
        BottomAppBar(
            actions = {
                IconButton(onClick = { /* screen logic */ }) {
                    Icon(Icons.Filled.Check, contentDescription = "Done")
                }
                IconButton(onClick = { /* ... */ }) {
                    Icon(Icons.Filled.Edit, contentDescription = "Edit")
                }
            },
            floatingActionButton = {
                FloatingActionButton(
                    onClick = { /* ... */ },
                    containerColor = BottomAppBarDefaults.bottomAppBarFabColor,
                    elevation = FloatingActionButtonDefaults.bottomAppBarFabElevation(),
                ) {
                    Icon(Icons.Filled.Add, contentDescription = "Add")
                }
            },
        )
    },
) { padding -> /* content */ }
```

Notes from the `code` (what the tool hands to the agent):

> Stable overload `BottomAppBar(actions = { … }, floatingActionButton = { … })`, without `scrollBehavior` (the overload with `scrollBehavior` requires `@OptIn(ExperimentalMaterial3Api::class)` and is not used here). Each filled `actionIcon1` to `actionIcon4` becomes an `IconButton(onClick = …) { Icon(Icons.Filled.<actionIconN>, contentDescription = …) }` inside `actions = { … }` (a `RowScope`, from left to right). With `floatingActionButton` filled in, `floatingActionButton = { FloatingActionButton(onClick = …, containerColor = BottomAppBarDefaults.bottomAppBarFabColor, elevation = FloatingActionButtonDefaults.bottomAppBarFabElevation()) { Icon(Icons.Filled.<floatingActionButton>, contentDescription = …) } }`; empty = omit the parameter. Inside a Scaffold, the bar goes in `bottomBar`. The height (80, plus the system navigation bar) belongs to the component: width and position come from the `Modifier`. Since material3 1.4.0 the icons require `androidx.compose.material:material-icons-core` (or `-extended`) or a Material Symbol downloaded with `painterResource`; the ones that mirror (ArrowBack, KeyboardArrowRight, List) are in `Icons.AutoMirrored.Filled`.

## Examples

- **With floating button**: actionIcon1=Check, actionIcon1Description=Done, actionIcon2=Edit, actionIcon2Description=Edit, actionIcon3=Favorite, actionIcon3Description=Favorite, floatingActionButton=Add, floatingActionButtonDescription=Add
- **Four actions**: actionIcon1=Home, actionIcon1Description=Home, actionIcon2=Search, actionIcon2Description=Search, actionIcon3=Person, actionIcon3Description=Profile, actionIcon4=Settings, actionIcon4Description=Settings
- **One action and button**: actionIcon1=Search, actionIcon1Description=Search, floatingActionButton=Edit, floatingActionButtonDescription=Edit

## Fidelity

Reference: Compose `material3` 1.4.0, commit `5113b82a4ed6416d6344efa50e41db8cb65928ff` (decisions 1 to 3 of the faithful Material 3 stage). 1 dp = 1 component unit; the container density converts to image pixels (`docs/COMPONENT-FORMAT.md`, "Units and density"). The values come from the specialization tokens (`tokens`, in the `light` and `dark` modes), which mirror the androidx token files; no color, font or radius is literal in the component and the icons are the `icon` node of the library set, chosen by the field's `$switch` (no SVG path in the component).

**Files used**

- `compose/material3/material3/src/commonMain/kotlin/androidx/compose/material3/AppBar.kt` (lines 1035 to 1133: the `BottomAppBar` with `actions` and `floatingActionButton`, the actions in a `Row` of weight 1 and the FAB in a `Box` with `padding(top = FABVerticalPadding, end = FABHorizontalPadding)` and `contentAlignment = TopStart`; 1320 to 1400: `BottomAppBarLayout`, the `Surface` and the `Row` of height `containerHeight` with `padding(contentPadding)` and `verticalAlignment = CenterVertically`; 2125 to 2158: `BottomAppBarDefaults` (`containerColor`, `ContainerElevation` 0, `ContentPadding` and `bottomAppBarFabColor`); 2457 to 2462: `BottomAppBarHorizontalPadding` 4, `BottomAppBarVerticalPadding` 4, `FABHorizontalPadding` 12 and `FABVerticalPadding` 8).
- `compose/material3/material3/src/commonMain/kotlin/androidx/compose/material3/tokens/BottomAppBarTokens.kt` (`ContainerColor` `SurfaceContainer`, `ContainerHeight` 80, `ContainerShape` `CornerNone`) and `tokens/FabSecondaryContainerTokens.kt` (`ContainerColor` `SecondaryContainer`, `IconColor` `OnSecondaryContainer`).
- `compose/material3/material3/src/commonMain/kotlin/androidx/compose/material3/FloatingActionButton.kt` (lines 109 to 132: `FloatingActionButton`, `contentColor = contentColorFor(containerColor)`; 513 to 514: the shape `FabBaselineTokens.ContainerShape`; 591 to 603: `bottomAppBarFabElevation()` with 0 in all states) and `tokens/FabBaselineTokens.kt` (56 by 56, `CornerLarge`, 24 icon).

**How the drawing follows Compose**

- 80 bar (`BottomAppBarTokens.ContainerHeight`) in `surface-container`, with no shape (`CornerNone`) and no shadow: the default `tonalElevation` is 0 and the bar's `Surface` has no `shadowElevation`.
- Actions: 48 areas starting 4 from the left (`BottomAppBarHorizontalPadding`), side by side, centered in the 76 row (80 minus the 4 on top from the `contentPadding`), hence 18 from the top; 24 icons in `on-surface` (the `contentColorFor(surface-container)`).
- Embedded FAB: 56 by 56 in the `corner-large` shape (16), in `secondary-container` (`bottomAppBarFabColor`), with no shadow (`bottomAppBarFabElevation()` is 0), with the 24 icon in `on-secondary-container` (`contentColorFor`), 12 from the top (4 of top padding plus `FABVerticalPadding` 8) and 16 from the right (4 plus `FABHorizontalPadding` 12).

**Slots (named, `formatVersion` 17)**

- `actions` (`RowScope.() -> Unit`, `AppBar.kt` lines 1035 to 1133) is a slot with the `icon-button`, `icon-toggle-button` and `icon` types, a hug box of 76 high starting 4 from the left; `floatingActionButton` (`() -> Unit`, same lines) is a 56 by 56 slot, 12 from the top and 16 from the right, that takes one `fab` or `extended-fab`. The compose commit is `5113b82a4ed6416d6344efa50e41db8cb65928ff`.
- A child marking in a slot replaces its default content: with a child in `actions` the `actionIcon1` to `actionIcon4` icons are not drawn, with a child in `floatingActionButton` the FAB of the field is not drawn, and the `get_code_hints` writes `actions = { ... }` and `floatingActionButton = { ... }` with the children, with no `actionIconN`. Without children the drawing is the one of before.
- The children have no `weight` (Compose's `RowScope.weight`): the `Row` of weight 1 that shrinks what exceeds the space stays a limit (see below), and the slot's `layout` only places the children side by side.

**What still differs from Compose**

- The height of 80 does not add the system navigation bar (the bottom `windowInsets`) or the collapse on scroll (`scrollBehavior`).
- No pressed, focus and hover states on the actions and the FAB, and no minimum 48 touch target beyond the action's own area.
- The default content of `actions` draws up to four 48 icons (the fields) and those that exceed the space before the FAB do not shrink like the `Row` of weight 1; the child markings of the slot have no `weight` either.
- The icons are only those of the library set (`icons`); the `Icons.Filled` of the same name, without the mirroring ones (`AutoMirrored`).
- The FAB of the `floatingActionButton` field is always the regular 56 one; the `fab` and `extended-fab` markings go in the slot (an `ExtendedFloatingActionButton`, for example).
