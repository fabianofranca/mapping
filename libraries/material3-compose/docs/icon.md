# Icon

A 24 dp icon from the Material family. Use it alone or inside buttons, fields and list items.

Annotation type: `icon` (Content layer).

## Fields

| Key                  | Label       | Type   | Required | Options                                                   | Default | Description                                                                                                                                                    |
| -------------------- | ----------- | ------ | -------- | --------------------------------------------------------- | ------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `imageVector`        | Icon        | string | yes      | free text; icon suggestions (`Home`, `Search`, `Person`…) | `Home`  | Name of the icon in Icons.Default (for example Home). The list suggests the 164 icons of the library's set; a name outside it draws the placeholder and warns. |
| `contentDescription` | Description | string | no       |                                                           |         | Accessibility text of the icon. Empty = decorative (null).                                                                                                     |
| `tint`               | Color       | enum   | no       | `ColorScheme` roles                                       |         | Theme color role used for the icon. Empty = content color (LocalContentColor).                                                                                 |

## Compose

- Symbol: `androidx.compose.material3.Icon`
- File (`path`): `compose/material3/material3/src/commonMain/kotlin/androidx/compose/material3/Icon.kt`

How the annotation becomes the call (the values below are examples; the parameter names and expressions are those of `params` and `values` in `code`):

```kotlin
Icon(
    imageVector = Icons.Filled.Home,
    contentDescription = "Home", // no description: null
    tint = MaterialTheme.colorScheme.error, // only if tint is filled
)
```

Notes from `code` (what the tool hands to the agent):

> The icon comes from `Icons.Filled.<imageVector>`, for example `Icon(imageVector = Icons.Filled.Home, contentDescription = <contentDescription>)`; without a description use `contentDescription = null`. Since material3 1.4.0 the icons require `androidx.compose.material:material-icons-core` (or `-extended`) or a Material Symbol downloaded with `painterResource`; the ones that mirror (ArrowBack, KeyboardArrowRight, List) live in `Icons.AutoMirrored.Filled`, and in `rtl` the drawing flips them horizontally (the set's `mirror`). `tint` only goes in when filled; the size is the default 24 dp.

## Examples

- **Home**: imageVector=Home, contentDescription=Home
- **Colored favorite**: imageVector=Favorite, tint=error
- **Back**: imageVector=ArrowBack, contentDescription=Back

## Fidelity

Reference: Compose `material3` 1.4.0, commit `5113b82a4ed6416d6344efa50e41db8cb65928ff` (decisions 1 to 3 of the faithful Material 3 stage). 1 dp = 1 component unit; the container density converts it to image pixels (`docs/COMPONENT-FORMAT.md`, "Units and density"). The values come from the specialization tokens (`tokens`, in the `light` and `dark` modes), which mirror the androidx token files; no color, font or radius is literal in the component.

**Files used**

- `compose/material3/material3/src/commonMain/kotlin/androidx/compose/material3/Icon.kt` (lines 65 to 70: `tint = LocalContentColor.current`; lines 207 to 219: the default size `SmallIconButtonTokens.IconSize`).
- `compose/material3/material3/src/commonMain/kotlin/androidx/compose/material3/tokens/SmallIconButtonTokens.kt` (line 29: `IconSize` = 24 dp).
- `ColorLightTokens.kt` and `ColorDarkTokens.kt`: the `tint` roles.
- The icon drawings come from the npm package `@material-design-icons/svg` 0.14.15, `filled` folder (Compose's `Icons.Default`), in `icons/material-icons.json` (origin and license in `icons/LEIA-ME.txt` and `icons/LICENSE-material-icons.txt`).

**How the drawing follows Compose**

- The format 4 `icon` node picks the drawing from the library's set. The `imageVector` field holds the Compose name (`Home`, `KeyboardArrowRight`, what goes in `Icons.Default.<name>`) and the component translates it to the set's name (`home`, `keyboard_arrow_right`) through a `$switch`; the SVG path `$switch`es are gone from the component.
- The size is that of the icon's `viewBox` (24 by 24), scaled to the marking box.
- In `rtl`, an icon with `mirror` in the set (the back arrow, the end chevron) is drawn flipped within the same box; the box and the layout do not change (see `docs/COMPONENT-FORMAT.md`, "Reading direction").
- The color is the `tint` role; without `tint`, the inherited content color (`Icon.kt`, line 69: `tint = LocalContentColor.current`): inside a `surface` or `scaffold` it comes out in the color the parent offers, and with no parent, in `on-surface`.

**What still differs from Compose**

- The set has a closed subset of `Icons.Default` (see the suggestions of the `imageVector` field). A name outside it draws the placeholder (an outlined square) and Diagnostics shows the warning `unknown icon`; to use another icon, add it to the set (`icons/LEIA-ME.txt`).
- Only the `Filled` variant: `Outlined`, `Rounded`, `Sharp` and `TwoTone` are outside the stage.
- The set (`formatVersion` 2) marks with `mirror: true` the 24 icons that androidx puts in `Icons.AutoMirrored.Filled` (`arrow_back`, `arrow_forward`, `keyboard_arrow_left`, `keyboard_arrow_right`, `list`, `send`, `help`…, read from the `material-icons-core` and `-extended` 1.7.8 artifacts: the pinned commit does not carry the icon files, which are generated and published separately). In `rtl` (the direction of the container or of the project) the drawing flips them horizontally, as `AutoMirrored` does with `LayoutDirection.Rtl`; in `ltr` nothing changes. The other icons never flip (a clock, a camera).
- `PhotoCamera` and the other icons of the package that have shapes beyond `<path>` (a circle, for example) are not in the subset.
