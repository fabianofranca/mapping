# Libraries

What each library and each example shows, and how to open them, is in [`examples/README.md`](../examples/README.md).

Ready-to-use library packages (format in [`docs/SPEC-FORMAT.md`](../docs/SPEC-FORMAT.md), "Library: the package"). Each folder is a package: the specialization at the root, `components/` and `docs/`.

| Folder    | What it is                                                                                                       | How it reaches the project                                                                                       |
| --------- | ---------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `notas/`  | Floating notes and tables on the canvas (sticky notes), and plain text for labels, titles and captions.          | **Embedded** in the build (`index.ts`) and applied by default in a new project.                                  |
| `kotlin/` | Kotlin declarations: the eleven kinds of class, object and interface, with properties, functions and supertypes. | **Not embedded.** Download the folder (or a zip of it) and apply it in **Specializations › Apply folder…/zip…**. |

| `material3-compose/` | Material Design 3 (light and dark theme) for Jetpack Compose, with the composable of each type in `code` (`variants`). | **Not embedded.** Applied from the folder or from the ready-made zip `examples/material3-compose.zip` (`npm run build:material3-zip` regenerates it), like `kotlin/`. |

A folder with an `index.ts` is embedded; without it, the library is applied by the person. Every folder here has a test that validates it (`validateLibrary`, no errors): `tests/model/notesLibrary.test.ts`, `tests/model/kotlinLibrary.test.ts` and `tests/model/material3ComposeLibrary.test.ts`.

## Kotlin

The properties of each declaration (each row of **Properties**) are reference targets with the tags `data-field` and `kotlin-property`: a `ref` field of another layer or specialization that accepts one of them points to the property. The declarations link to each other through `ref` fields that accept `kotlin-type` (**Declared in**, **Supertypes › Mapped type**, **Properties › Mapped type**), which the agent reads in `refs` and `backlinks`. The details of each type are in `kotlin/docs/`.

## Material 3 (Compose)

Specialization `formatVersion` 15, library `version` 4 (`id` `material3-compose`) that maps the Material Design 3 components (baseline, light **and dark** theme) to Jetpack Compose: each type carries the composable in `code` (`symbol` and `path`), the variants in `variants` (an `outlined` button becomes `OutlinedButton`) and, in `notes`, how to build the slots. It is the ready-to-use library; a frozen copy of an old package, in `tests/fixtures/material3/`, is the fixed base of some tests.

**Tokens and icons (v2).** The specialization declares `tokens` in the `light` and `dark` modes: all the color roles of `ColorLightTokens` and `ColorDarkTokens` (`primary`, `on-primary`, `surface-container-high`… and the `shadow`), the 15 typography scales (`body-large-size`, `-line-height`, `-weight`, `-tracking`…), the shape (`corner-none` to `corner-extra-large` and `corner-full`), the elevation (`elevation-1-blur`, `-y`…), the state (`state-disabled-content`, `state-disabled-container`, `state-disabled-container-filled` and, since v4, `state-hover`, `state-focus`, `state-pressed` and `state-dragged`, from `StateTokens.kt`), the `corner-checkbox` radius and `font-sans` as Roboto. The drawing follows the project's mode (`drawingMode`). The icons come from the `icons/material-icons.json` set (a closed subset of Material Icons Filled, from the npm package `@material-design-icons/svg` 0.14.15, Apache 2.0 license in `icons/LICENSE-material-icons.txt`; origin in `icons/LEIA-ME.txt`). The components already migrated to format 4 (today `text`, `icon`, `divider` and `surface`; the others follow in the phases of the faithful Material 3 stage) have no literal color, font or icon path: they read the tokens and the set. The update from v1 to v2 is additive: no field changes key, type or options.

**Reading direction and anchor (v14).** The icon set moves to `formatVersion` 2 with `mirror: true` on the 24 icons that androidx puts in `Icons.AutoMirrored.Filled` (`arrow_back`, `arrow_forward`, `keyboard_arrow_left`, `keyboard_arrow_right`, `list`, `send`, `help`…): in `rtl` the drawing flips them horizontally. The `tooltip` declares `anchor` at the root (`top`, `center`, 4, the spacing of `TooltipBox`) and, with the marking anchored, draws the 16 × 8 arrow of `TooltipDefaults` under the center of the anchor, on all four sides (`$anchor.side`, `$anchor.x`, `$anchor.y`; without an anchor, no arrow); the `badge` declares `anchor` `end`/`start` with the offset of 6 from `BadgedBox` (for the counter, main `offset` -12 and cross -2 on the marking) and the `dropdown-menu`, `bottom`/`start`. Additive update, no new `migrations`.

**Interaction states (v4).** The `button` has the `interaction` field (`none`, `hovered`, `focused`, `pressed`; default `none`, outside `code`) that draws the resting appearance of the state: a `estado` layer with the state token and the elevation per state, and disabled wins. The field is in the 22 types that Compose defines state for: `button`, `fab`, `extended-fab`, `icon-button`, `icon-toggle-button`, `chip`, `card`, `checkbox`, `radio-button`, `switch`, `slider`, `segmented-button`, `text-field`, `secure-text-field`, `search-bar`, `dropdown-menu`, `list-item`, `tabs`, `navigation-bar`, `short-navigation-bar`, `navigation-rail` and `navigation-drawer`, each with the options that the type's tokens name (`dragged` only on `chip`, `card` and `list-item`; the text fields and the `dropdown-menu` have no `pressed`); in the multi-item components (`segmented-button` and the navigation) the state applies to the selected item. The other types did not get the field because Compose has no interaction state for them. The state tokens are `state-hover`, `state-focus`, `state-pressed` and `state-dragged`. The update from v3 to v4 is additive (new optional tokens and fields).

**Pinned version.** `androidx.compose.material3:material3` **1.4.0**, commit `5113b82a4ed6416d6344efa50e41db8cb65928ff` of androidx (the GitHub mirror has no tags, hence the commit; it is what `platforms[].repo` and the `path` of each type point to). No type requires the expressive API: it does not even exist as a public composable at that commit.

**Layers and types in this version (50).**

- Layout: `scaffold`, `surface`, `box`, `row`, `column`, `lazy-column`, `lazy-row`, `lazy-vertical-grid`, `flow-row`, `spacer`, `horizontal-pager`.
- Content: `text`, `icon`, `image`.
- Components: `top-app-bar`, `button`, `fab`, `extended-fab`, `text-field`, `switch`, `checkbox`, `chip`, `card`, `list-item`, `navigation-bar`, `bottom-sheet`, `icon-button`, `icon-toggle-button`, `segmented-button`, `radio-button`, `slider`, `search-bar`, `date-picker`, `time-picker`, `badge`, `snackbar`, `tooltip`, `progress-indicator`, `secure-text-field`, `divider`, `alert-dialog`, `dropdown-menu`, `navigation-rail`, `short-navigation-bar`, `navigation-drawer`, `tabs`, `bottom-app-bar`, `carousel`, `pull-to-refresh`, `swipe-to-dismiss`.

Each type has a component, a document in `material3-compose/docs/` and one to three examples. The catalog of stable Material 3 in the pinned Compose is complete (the side sheet has no public composable).

**Minimum size (`minSize`).** Only a component whose composable defines an official minimum **on both axes** has `minSize`, with the value from the androidx code at the pinned commit (`compose/material3/material3/src/commonMain/kotlin/androidx/compose/material3/`); without an official source, the field does not exist and only the app's general minimum (8 px) applies.

| Type                                | `minSize`             | Official source                                                                                                              |
| ----------------------------------- | --------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `button`                            | 58 × 40               | `Button.kt:527,533` (`ButtonDefaults.MinWidth`, `MinHeight`), applied at `Button.kt:144`                                     |
| `segmented-button`                  | 58 × 40 (per segment) | `SegmentedButton.kt:155-157` (the same `ButtonDefaults`)                                                                     |
| `text-field`, `secure-text-field`   | 280 × 56              | `TextFieldDefaults.kt:75,81` (`MinHeight`, `MinWidth`), applied at `TextField.kt:305` and `SecureTextField.kt:173`           |
| `search-bar`                        | 360 × 56              | `SearchBar.kt:2712` (`SearchBarMinWidth`) and `:1036` (`InputFieldHeight`)                                                   |
| `tooltip`                           | 40 × 24               | `Tooltip.kt:1642-1643` (`TooltipMinWidth`, `TooltipMinHeight`)                                                               |
| `badge`                             | 6 × 6                 | `Badge.kt:169` with `BadgeTokens.Size` (6 dp, no content; with content the minimum is 16 × 16)                               |
| `fab`                               | 40 × 40               | `FloatingActionButton.kt:212` (small FAB; the regular is 56 × 56 and the large 96 × 96, the floor is the smallest variant's) |
| `extended-fab`                      | 56 × 56               | `FloatingActionButton.kt:407-412` (collapsed: 56; with a label the minimum width is 80)                                      |
| `icon-button`, `icon-toggle-button` | 40 × 40               | `IconButton.kt:178` (`smallContainerSize`, `SmallIconButtonTokens.ContainerHeight` and `IconSize`)                           |

Without `minSize`, because there is no official minimum on both axes: the containers and layout (`scaffold`, `surface`, `box`, `row`, `column`, `lazy-*`, `flow-row`, `spacer`, `horizontal-pager`), `text`, `icon`, `image`, `card`, `carousel`, `pull-to-refresh`, `swipe-to-dismiss`, `bottom-sheet`, `date-picker`, `time-picker` and `progress-indicator` (fixed size by shape). With an official minimum on **one axis only** (the width of `alert-dialog` 280 and `navigation-drawer` 240, the height of `top-app-bar` 64, `navigation-bar` 80, `short-navigation-bar` 64, `list-item` 56 to 88, `snackbar` 48 and `chip` 32, among others): the format requires both axes, so they stay without `minSize`. `checkbox`, `radio-button`, `switch` and `slider` also stay without: the official minimum belongs to the control, and the library's drawing includes the label or a larger thumb.

**Patterns.**

- **Slots (lambdas) in `notes`.** `onClick`, `icon = { … }`, `title = { … }` and `content` are not fields: `params` passes only simple values (booleans, colors, numbers, enums) and `notes` says how to build each slot with the fields (`label = { Text(label) }`).
- **Scaffold by the child's type.** `top-app-bar` goes in `topBar`, `navigation-bar` in `bottomBar`, `fab` and `extended-fab` in `floatingActionButton` and the rest in `content = { innerPadding -> … }`.
- **Size.** `width` and `height` (`wrap`, `fill`, `fixed`) and `weight` do not go in `params`; they become `Modifier.fillMaxWidth()`, `Modifier.width(<marking width>.dp)` and `Modifier.weight(<weight>f)`. In the library's containers 1 px = 1 dp; in a screenshot, divide by the density (image width in px ÷ device width in dp).
- **Alignment.** The options have the Compose name (`SpaceBetween`, `CenterVertically`, `TopStart`) and `values` translates them into the full expression (`Arrangement.SpaceBetween`).
- **Icons.** `string` fields with `suggestions` (the icons of the set, in the Compose name: `Home`, `Search`, `Add`…), without restricting the value (a name outside the set draws the placeholder and warns); `notes` uses `Icons.Filled.<name>`. Version 1.4.0 stopped shipping the icons: the app adds `androidx.compose.material:material-icons-core` (or `-extended`) or uses a Material Symbol with `painterResource`; the ones that mirror (`ArrowBack`, `KeyboardArrowRight`, `List`) are in `Icons.AutoMirrored.Filled` and, in `rtl`, the drawing flips them (`mirror` in the set).
- **Remote image.** `image.url`, `card.media` and `list-item.leadingImage` are URLs; the drawing uses the app's image loader, and the code (for example Coil `AsyncImage`) is outside androidx and the library.
- **Opt-in.** The types that require `@OptIn(ExperimentalMaterial3Api::class)` (such as `bottom-sheet`) say so in `notes`.

**Out of this version.** The expressive API (`ButtonGroup`, `ToggleButton`, `FloatingActionButtonMenu` and relatives), which does not exist as a public composable at the pinned commit; the side sheet; and the Scrim, which `ModalBottomSheet` already draws.

The fonts (`fonts/`) come in the package: Roboto 400 and 500 in `.woff2` (Latin subset, Fontsource 5.3.0, OFL license in `fonts/LICENSE-Roboto.txt`; see `material3-compose/fonts/LEIA-ME.txt`), so the library validates **with no warning at all**. The test `tests/model/material3ComposeLibrary.test.ts` validates the package.

## Runnable origin example

The example of `origins`, `sources` and `migrations` is not a ready-to-use library: it is `examples/libraries/sdui-backend/` (a fictional external system that describes screens in JSON, with six types). A real library does not describe anyone's backend, so `material3-compose` does not get an origin.
