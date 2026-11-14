# Scaffold

Material 3 screen structure: top bar, bottom bar, floating action button and content. Each child marking goes to the Scaffold slot given by its type.

Annotation type: `scaffold` (layer Layout).

## Fields

| Key                            | Label                           | Type | Required | Options                                | Default      | Description                                                                                        |
| ------------------------------ | ------------------------------- | ---- | -------- | -------------------------------------- | ------------ | -------------------------------------------------------------------------------------------------- |
| `containerColor`               | Background color                | enum | no       | `ColorScheme` roles                    | `background` | Theme color role used as the screen background.                                                    |
| `floatingActionButtonPosition` | Floating action button position | enum | no       | `Start`, `Center`, `End`, `EndOverlay` | `End`        | Where the FAB goes (FabPosition). EndOverlay overlaps it on the bottom bar.                        |
| `width`                        | Width                           | enum | no       | `wrap`, `fill`, `fixed`                | `fill`       | wrap fits the content, fill takes all the available width and fixed uses the marking width (dp).   |
| `height`                       | Height                          | enum | no       | `wrap`, `fill`, `fixed`                | `fill`       | wrap fits the content, fill takes all the available height and fixed uses the marking height (dp). |

## Slots by child type

The Scaffold has fixed slots, and each child marking goes to the slot its **type** indicates:

| Child type            | Scaffold slot                     |
| --------------------- | --------------------------------- |
| `top-app-bar`         | `topBar`                          |
| `navigation-bar`      | `bottomBar`                       |
| `fab`, `extended-fab` | `floatingActionButton`            |
| any other             | `content = { innerPadding -> … }` |

Apply `Modifier.padding(innerPadding)` to the first child of `content`. A `standard` `bottom-sheet` is not a child of the Scaffold: it is the `BottomSheetScaffold` itself, with the screen in `content`.

## Compose

- Symbol: `androidx.compose.material3.Scaffold`
- File (`path`): `compose/material3/material3/src/commonMain/kotlin/androidx/compose/material3/Scaffold.kt`

How the annotation becomes the call (the values below are examples; the parameter names and expressions are those of `params` and `values` in `code`):

```kotlin
Scaffold(
    containerColor = MaterialTheme.colorScheme.background,
    floatingActionButtonPosition = FabPosition.End,
    modifier = Modifier.fillMaxSize(),
    topBar = { /* top-app-bar child */ },
    bottomBar = { /* navigation-bar child */ },
    floatingActionButton = { /* fab or extended-fab child */ },
) { innerPadding ->
    Column(Modifier.padding(innerPadding)) { /* the other children */ }
}
```

`code` notes (what the tool hands to the agent):

> The slot of each child marking comes from its type: `top-app-bar` goes in `topBar`, `navigation-bar` in `bottomBar`, `fab` and `extended-fab` in `floatingActionButton` and the rest in `content = { innerPadding -> … }`, applying `Modifier.padding(innerPadding)` to the first child of the content. A `modal` `bottom-sheet` goes in the content (the `ModalBottomSheet` opens over the screen); the `standard` one is the `BottomSheetScaffold` itself and replaces the Scaffold. With width and height `fill`, use `Modifier.fillMaxSize()`; `snackbarHost` and `contentWindowInsets` stay at their defaults.

## Examples

- **Default screen**: containerColor=background, floatingActionButtonPosition=End, width=fill, height=fill
- **Centered FAB**: containerColor=surface, floatingActionButtonPosition=Center, width=fill, height=fill

## Fidelity

Reference: Compose `material3` 1.4.0, commit `5113b82a4ed6416d6344efa50e41db8cb65928ff` (decisions 1 to 3 of the faithful Material 3 stage). 1 dp = 1 component unit; the container density converts it to image pixels (`docs/COMPONENT-FORMAT.md`, "Units and density"). The values come from the specialization tokens (`tokens`, in the `light` and `dark` modes), which mirror the androidx token files; no color, font or radius is literal in the component.

**Files used**

- `compose/material3/material3/src/commonMain/kotlin/androidx/compose/material3/Scaffold.kt` (lines 83 to 94: `Scaffold(containerColor = MaterialTheme.colorScheme.background, floatingActionButtonPosition = FabPosition.End)`; lines 100 to 105: the background is the `Surface(color = containerColor)`, with no tonal elevation; line 355: `FabSpacing = 16.dp`).
  `ColorLightTokens.kt` and `ColorDarkTokens.kt`: the theme color roles, read as tokens (`$token`) in both modes.

**How the drawing follows Compose**

- The background is the `containerColor` role (default `background`), read from the role token in both modes; before, they were fixed hex values, the same in both modes.
- Since the `Surface` in `Scaffold.kt` does not pass `tonalElevation`, the background gets no tonal overlay.

**What still differs from Compose**

- The Scaffold draws only the background and the `content` area: `topBar`, `bottomBar`, `snackbarHost` and `floatingActionButton` are children (other types) that stay where the person marked them. The FAB position (`floatingActionButtonPosition`) and the 16 dp `FabSpacing` are only field information; the position is not drawn.
- The content color is the inherited one: the slot offers `contentColorFor(containerColor)` (`Scaffold.kt`, line 91, `contentColor: Color = contentColorFor(containerColor)`; the table is in `ColorScheme.kt`, lines 1064 to 1092) through the `provide` of `content-color`, and the text, icon and icon button inside the Scaffold read it. `contentColor` is a field and code, but the drawing does not use it; `contentWindowInsets` is not a field of the type.
