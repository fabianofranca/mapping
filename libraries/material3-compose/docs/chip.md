# Chip

Compact chip. Assist suggests an action, filter filters content, input represents a typed value and suggestion proposes a reply. Each style has the elevated version.

Annotation type: `chip` (Components layer).

## Fields

| Key                       | Label                     | Type   | Required | Options                                                                                                | Default  | Description                                                                                                                                                                                                     |
| ------------------------- | ------------------------- | ------ | -------- | ------------------------------------------------------------------------------------------------------ | -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `label`                   | Label                     | string | yes      |                                                                                                        |          | Chip text.                                                                                                                                                                                                      |
| `style`                   | Style                     | enum   | no       | `assist`, `assist-elevated`, `filter`, `filter-elevated`, `input`, `suggestion`, `suggestion-elevated` | `assist` | assist, filter, input or suggestion, each also in the elevated version.                                                                                                                                         |
| `selected`                | Selected                  | enum   | no       | `true`, `false`                                                                                        | `false`  | true marks the chip. Only applies to the filter and input styles.                                                                                                                                               |
| `enabled`                 | Enabled                   | enum   | no       | `true`, `false`                                                                                        | `true`   | false disables the chip.                                                                                                                                                                                        |
| `interaction`             | Interaction               | enum   | no       | `none`, `hovered`, `focused`, `pressed`, `dragged`                                                     | `none`   | Still appearance of the interaction state: hovered, focused, pressed or dragged; none = no state layer. Only changes the drawing, does not enter the code. With enabled false it draws nothing (disabled wins). |
| `leadingIcon`             | Leading icon              | string | no       | free text; icon suggestions (`Home`, `Search`, `Person`…)                                              |          | Icon before the text. Empty = no icon.                                                                                                                                                                          |
| `leadingIconDescription`  | Leading icon description  | string | no       | free text                                                                                              |          | Accessible description of the leading icon, read by a screen reader. Empty = the icon is decorative and is not announced.                                                                                       |
| `avatar`                  | Avatar                    | string | no       |                                                                                                        |          | https:// address of the avatar image, in the input style: 24 circular image at the start of the chip, in place of the leading icon (InputChip avatar). Empty = no avatar.                                       |
| `trailingIcon`            | Trailing icon             | string | no       | free text; icon suggestions (`Home`, `Search`, `Person`…)                                              |          | Icon after the text. Empty = no icon. Does not exist on suggestion.                                                                                                                                             |
| `trailingIconDescription` | Trailing icon description | string | no       | free text                                                                                              |          | Accessible description of the trailing icon, read by a screen reader. Empty = the icon is decorative and is not announced.                                                                                      |

## Compose

- Symbol: `androidx.compose.material3.AssistChip`
- File (`path`): `compose/material3/material3/src/commonMain/kotlin/androidx/compose/material3/Chip.kt`
- The `style` field chooses the symbol; values without their own case use the base one.

| `style`               | Symbol                   |
| --------------------- | ------------------------ |
| `assist` (base)       | `AssistChip`             |
| `assist-elevated`     | `ElevatedAssistChip`     |
| `filter`              | `FilterChip`             |
| `filter-elevated`     | `ElevatedFilterChip`     |
| `input`               | `InputChip`              |
| `suggestion`          | `SuggestionChip`         |
| `suggestion-elevated` | `ElevatedSuggestionChip` |

How the annotation becomes the call (the values below are examples; the parameter names and expressions are those of `params` and `values` in the `code`):

```kotlin
AssistChip(    // style assist-elevated: ElevatedAssistChip
    onClick = { /* screen logic */ },
    label = { Text("Add to calendar") },
    leadingIcon = {
        Icon(Icons.Filled.DateRange, contentDescription = null, Modifier.size(AssistChipDefaults.IconSize))
    },
)

FilterChip(    // style filter; filter-elevated: ElevatedFilterChip
    selected = true,
    onClick = { /* ... */ },
    label = { Text("Open now") },
    leadingIcon = {
        Icon(Icons.Filled.Done, contentDescription = null, Modifier.size(FilterChipDefaults.IconSize))
    },
)
```

Notes from the `code` (what the tool hands to the agent):

> `onClick` connects to the screen logic and `label = { Text(<label>) }`. Filled-in `leadingIcon` and `trailingIcon` become `{ Icon(Icons.Filled.<name>, contentDescription = null, Modifier.size(AssistChipDefaults.IconSize)) }`. No style requires opt-in.

`filter` variant: `selected` and `onClick` connect to the filter state and `label = { Text(<label>) }`. With `selected = true` it is customary to use `leadingIcon = { Icon(Icons.Filled.Done, contentDescription = null, Modifier.size(FilterChipDefaults.IconSize)) }`; a filled-in `trailingIcon` becomes an `Icon` of the same size.

`filter-elevated` variant: `selected` and `onClick` connect to the filter state and `label = { Text(<label>) }`. With `selected = true` it is customary to use `leadingIcon = { Icon(Icons.Filled.Done, contentDescription = null, Modifier.size(FilterChipDefaults.IconSize)) }`; a filled-in `trailingIcon` becomes an `Icon` of the same size.

`input` variant: `selected` and `onClick` connect to the value state and `label = { Text(<label>) }`. `trailingIcon` is usually `Icons.Filled.Close` to remove the value; the `avatar` field, when filled in, becomes `avatar = { AsyncImage(model = <avatar>, contentDescription = null, contentScale = ContentScale.Crop, modifier = Modifier.size(InputChipDefaults.AvatarSize)) }` (the app's image loader, outside androidx): the InputChip clips the avatar to the circle (`InputChipTokens.AvatarShape`) and, with it, does not show the `leadingIcon`.

`suggestion` variant: `onClick` connects to the screen logic and `label = { Text(<label>) }`. The SuggestionChip has a single icon, called `icon`: `icon = { Icon(Icons.Filled.<leadingIcon>, contentDescription = null, Modifier.size(SuggestionChipDefaults.IconSize)) }`.

`suggestion-elevated` variant: `onClick` connects to the screen logic and `label = { Text(<label>) }`. The ElevatedSuggestionChip has a single icon, called `icon`: `icon = { Icon(Icons.Filled.<leadingIcon>, contentDescription = null, Modifier.size(SuggestionChipDefaults.IconSize)) }`.

## Examples

- **Assist**: label=Add to calendar, style=assist, leadingIcon=DateRange
- **Selected filter**: label=Open now, style=filter, selected=true
- **Typed value**: label=ana@example.com, style=input, trailingIcon=Close
- **Hovered**: label=Open now, style=filter-elevated, interaction=hovered
- **Focused**: label=Add to calendar, style=assist, leadingIcon=DateRange, interaction=focused
- **Pressed**: label=Open now, style=filter, selected=true, interaction=pressed
- **Dragged**: label=ana@example.com, style=input, trailingIcon=Close, interaction=dragged
- **With avatar**: label=Ana Souza, style=input, avatar=https://example.com/ana.png, trailingIcon=Close
- **Long label**: label=Create team meeting, style=assist, leadingIcon=DateRange

## Fidelity

Reference: Compose `material3` 1.4.0, commit `5113b82a4ed6416d6344efa50e41db8cb65928ff` (decisions 1 to 3 of the faithful Material 3 stage). 1 dp = 1 component unit; the container density converts to image pixels (`docs/COMPONENT-FORMAT.md`, "Units and density"). The values come from the specialization tokens (`tokens`, in the `light` and `dark` modes), which mirror the androidx token files; no color, font or radius is literal in the component.

**Files used**

- `compose/material3/material3/src/commonMain/kotlin/androidx/compose/material3/Chip.kt`: the chips (`AssistChip`, `ElevatedAssistChip`, `FilterChip`, `ElevatedFilterChip`, `InputChip`, `SuggestionChip`, `ElevatedSuggestionChip`, lines 130 to 1000), the `Defaults` and the default colors (lines 1005 to 1940: `assistChipColors` at lines 1051 to 1070, `elevatedAssistChipColors` 1195 to 1218, `filterChipColors` 1319 to 1350, `elevatedFilterChipColors` 1476 to 1510, `inputChipColors` 1616 to 1650, `suggestionChipColors` 2719 to 2737, `elevatedSuggestionChipColors` 1885 to 1905; borders at 1398, 1692, 1805), the `Chip` and the `SelectableChip` (lines 1942 to 2037: `Surface` with color, `shadowElevation` and border), the `ChipContent` (lines 2042 to 2100) and the measure policy `ChipLayoutMeasurePolicy` (lines 2257 to 2300), and the paddings (lines 2943 to 2964: `inputChipPadding` 4 or 8, `HorizontalElementsPadding = 8.dp`, `AssistChipPadding`, `FilterChipPadding`, `SuggestionChipPadding`).
- `compose/material3/material3/src/commonMain/kotlin/androidx/compose/material3/tokens/AssistChipTokens.kt`, `FilterChipTokens.kt`, `InputChipTokens.kt` and `SuggestionChipTokens.kt` (height 32, `CornerSmall`, `LabelTextFont = LabelLarge`, 18 icons, container, label and icon colors per state, opacities 0.38 and 0.12, `FlatOutlineColor = OutlineVariant`, `ElevatedContainerElevation = Level1`, the elevations and the outline per state of the `interaction` field) and `ElevationTokens.kt` (`Level1 = 1.dp`, `Level2 = 3.dp`, `Level4 = 8.dp`) and `StateTokens.kt` (the state layer opacities).
- `ColorLightTokens.kt`, `ColorDarkTokens.kt` and `ShapeTokens.kt` (`corner-small` 8).

**How the drawing follows Compose**

- Minimum height of 32 and `corner-small`. The flat chips (`assist`, `filter`, `input`, `suggestion`) have no background and have a 1 outline in `outline-variant`; when selected (`filter` and `input`) the background is `secondary-container` and the outline goes away (`SelectedOutlineWidth = 0`). The elevated ones have a `surface-container-low` background (the selected `filter-elevated`, `secondary-container`), a level 1 shadow and no outline.
- The label uses `label-large-*`. Colors: assist `on-surface`; suggestion `on-surface-variant`; filter and input `on-surface-variant`, and `on-secondary-container` when selected. Leading icon: assist, suggestion and unselected filter in `primary`; selected filter in `on-secondary-container`; input in `on-surface-variant` (selected, `primary`). Trailing icon: assist in `primary`; filter and input in `on-surface-variant` (selected, `on-secondary-container`). The suggestion has no trailing icon (Compose only gives one icon, the leading one), so `trailingIcon` does not draw on it.
- **Height from the label lines:** `sizing.height` is `hug` and the root carries the minimum of 32 (`minHeight`). The `content` frame and the `label` node hug the height and the chip has no vertical padding, like `Chip.kt`: `Modifier.defaultMinSize(minHeight = minHeight).padding(paddingValues)` (lines 2059 and 2126), with `paddingValues` only on the sides (lines 2943 to 2964) and the label's `Row` with `padding(HorizontalElementsPadding, 0.dp)` (lines 2076 and 2162). One line (20) stays within the 32 minimum and two lines measure 40.
- **The label wraps in the remaining width:** the `maxWidth` of the `label` node is the instance width (`$size.width`) minus the style's side paddings and, for each visible icon or avatar, its width plus the 8 of space (18 + 8 per icon, 24 + 8 for the avatar). Arrange and `fit_marking` keep the marking width and take the height to the lines.
- `Chip.kt` measurements: 8 of padding on the edges, 18 icon and 8 on each side of the label (the text starts 16 from the edge without an icon and 34 with a leading icon); the input uses 4 (without a leading icon) or 8 (with a leading icon) on the edges, and 4 or 8 (with a trailing icon) at the end.
- A selected filter without `leadingIcon` draws the check (`done`), which is Compose's custom for the checked filter; with `leadingIcon` filled in, it draws the chosen icon, like Compose (which draws only what it receives).
- Disabled: label and icons in `on-surface` with the `state-disabled-content` opacity (0.38); the container of the elevated and the selected ones in `on-surface` with `state-disabled-container` (0.12); the outline of the unselected flat ones in `on-surface` with 0.12; no shadow.
- The icons are `icon` nodes of the library set, with the `$switch` from the Compose name to the set name, covering the `leadingIcon` and `trailingIcon` suggestions.
- Single-line label centered by the capital letter (`cap-middle`): the `label` node uses `font.verticalAlign: "cap-middle"` and hugs the line height (`height: "hug"`), with the `content` frame centered in the chip height, without changing the horizontal position. Compose's `Text` centers by the font's line box (ascent and descent); the drawing centers the capital height in the box, and with Roboto the two coincide to within 1 px.

**Interaction state (`interaction` field)**

The field chooses the still appearance of a state, as `enabled` chooses the disabled one; it does not enter the `code` or the `variants`. The options are `none` and the states that the commit's `*ChipTokens.kt` define for the chip: `hovered`, `focused`, `pressed` and `dragged` (`DraggedContainerElevation` exists in the four files). The state applies to any style; `selected` only counts in the `filter` and `input` styles, as in the rest of the drawing.

- **State layer:** the `state` node is a `rect` with the chip's shape (`corner-small`), between the outline and the content, with the style's label color (the `*ChipTokens.kt` repeat the label color in `Hover*`, `Focus*`, `Pressed*` and `Dragged*`): `on-surface` on assist, `on-surface-variant` on suggestion and on unselected filter and input, `on-secondary-container` on selected filter and input. The `opacity` comes from the tokens `state-hover` (0.08), `state-focus` (0.10), `state-pressed` (0.10) and `state-dragged` (0.16), which mirror `compose/material3/material3/src/commonMain/kotlin/androidx/compose/material3/tokens/StateTokens.kt` (lines 22 to 25: `DraggedStateLayerOpacity`, `FocusStateLayerOpacity`, `HoverStateLayerOpacity`, `PressedStateLayerOpacity`).
- **Elevation per state** (`AssistChipTokens.kt`, `FilterChipTokens.kt`, `InputChipTokens.kt` and `SuggestionChipTokens.kt`): the elevated goes from 1 (`ElevatedContainerElevation`, line 31 of assist and suggestion, 29 of filter) to 3 dp, level 2, on hover (`ElevatedHoverContainerElevation`, line 36 of assist and suggestion, 34 of filter) and stays at 1 on focus and pressed (`ElevatedFocusContainerElevation` and `ElevatedPressedContainerElevation`, lines 35 and 37, 33 and 35 on filter). The flat chip has level 0; only the selected `filter` rises to level 1 on hover (`FlatSelectedHoverContainerElevation`, `FilterChipTokens.kt` line 45; the unselected one stays at 0, line 50). When dragged (`DraggedContainerElevation`, `AssistChipTokens.kt` line 28, `FilterChipTokens.kt` line 28, `InputChipTokens.kt` line 33, `SuggestionChipTokens.kt` line 28), all styles go to level 4 (8 dp, `ElevationTokens.kt` line 28). The shadow's `y` and `blur` accept `$token`, but not an expression (the level does not switch with the state in the same node): level 1 is the frame's shadow (y 1, blur 2, those of `elevation-1-*`) and 2 and 4 are the separate nodes `level 2 shadow` (y 2, blur 6, those of `elevation-2-*`) and `level 4 shadow` (y 4, blur 16, those of `elevation-4-*`), each with the chip's background and outline, visible only in the state that asks for the level. The input has no hover, focus or pressed elevation (`ContainerElevation` is level 0, line 24).
- **Outline color** (unselected flat chip): on focus the assist uses `on-surface` (`FlatFocusOutlineColor`, `AssistChipTokens.kt` line 41) and the suggestion, the filter and the input `on-surface-variant` (`SuggestionChipTokens.kt` line 41, `FilterChipTokens.kt` line 49, `InputChipTokens.kt` line 45); in the other states it is `outline-variant`, as at rest. Selected and elevated have no outline in any state.
- **Icon color:** the `*ChipTokens.kt` change the icon color in some input states (for example, the unselected leading icon goes to `primary` on hover, focus and pressed, and the selected trailing one to `primary` when dragged); the drawing keeps the icon's resting color in all states.
- **Disabled wins:** with `enabled` `false` the `state` node is invisible and the state shadows go away, so the drawing is the disabled one, whatever the `interaction`.

**What still differs from Compose**

- The two shadows (point and ambient) come from the tokens `elevation-<n>-point-*` and `elevation-<n>-ambient-*` (`$token` in `shadow`, a list of two shadows with `spread`); the tokens `elevation-<n>-y`, `elevation-<n>-blur` and `elevation-shadow` remain in the specialization for compatibility, but no component uses them.
- The `avatar` field (`https://` URL) draws, in the `input` style, the 24 circular image (`InputChipTokens.AvatarSize` and `AvatarShape` `CornerFull`, `InputChipTokens.kt`) at the start of the chip, clipped by the shape, at 0.38 when disabled (`DisabledAvatarOpacity`, `Chip.kt` lines 650 to 665). With it the leading icon (and the selected check) does not appear (`leadingContent`, `Chip.kt` lines 2204 to 2216: `avatar != null -> avatar`) and the start of the chip is as without an icon (`inputChipPadding`, line 2949). The image is only requested from the network with the origin's permission in the app, and the MCP server draws the placeholder. Outside `input` the field has no effect. No avatar `contentDescription` (Compose leaves it to the `avatar`).
- On a marking the width is its own (Arrange does not change it). Without a rectangle (new instance, screen arranged by `layoutScreen`) the width is that of the content (`sizing.width` `hug`), with the `size` of 232 as the label's starting width: a label wider than that wraps instead of widening the chip, where Compose, with no limit from the parent, does not wrap. The "Long label" example ("Create team meeting") is the longest label that fits on one line in the `size` (232 × 32): a label that wraps onto two lines (like "Add meeting to the shared calendar") goes past the 32 box until Arrange takes it to 40.
- No animated ripple, no transition between states and no animation of the `SelectableChip` icons (the drawing is a still frame). On `focused` the chip gets the focus ring (`FocusIndicatorColor`: `AssistChipTokens.kt` line 44, `FilterChipTokens.kt` 54, `InputChipTokens.kt` 34 and `SuggestionChipTokens.kt` 44): the 3 ring in `secondary`, offset 2 from the shape (`stroke.offset`), outside the box (the width and the offset are those of the stage decision; the `*Tokens.kt` only carries the color).
- On flat chips with a `none` background (assist, suggestion, unselected filter and unselected input) the two level 1 or 4 shadows come from the outline and the content that the canvas draws, because there is no background to cast it: the shadow shape is approximate.
- `Chip.kt` only uses the state tokens for the elevation (`ChipElevation`, lines 2333 to 2340); the outline color on focus and the icon color in the states of the `*ChipTokens.kt` are not read by it. The drawing follows the tokens, as the stage asks. On the other hand, the default values of `filterChipElevation` (lines 1365 to 1372) give level 1 on hover to every flat `FilterChip`, selected or not; the drawing follows the token (only the selected one).

**Accessibility** (stage #1081; the unit is the dp, 1 dp = 1 component unit): the type has `accessibility.role` `button` and reads the accessible name from the `label` field; the leading and trailing icons are parts with their own description field (`leadingIconDescription` and `trailingIconDescription`, both optional: a decorative icon needs none). It declares `touchTarget` `expanded` (48 × 48, inherited from the root): Compose enlarges the touch area with `minimumInteractiveComponentSize`, `compose/material3/material3/src/commonMain/kotlin/androidx/compose/material3/Surface.kt` (lines 219 and 325: `clickable` and `selectable` `Surface`). The role is that of the base case: `Role.Button` for the assist and suggestion chips (`compose/material3/material3/src/commonMain/kotlin/androidx/compose/material3/Chip.kt` (lines 1961 to 1963)), while the filter and input chips use `Role.Checkbox` (`compose/material3/material3/src/commonMain/kotlin/androidx/compose/material3/Chip.kt` (lines 2007 to 2010)); the specialization records the base case and the other cases stay as they are until the role per case of `variants` or field value exists (#1999). The overlap of the expanded touch areas between neighbors is not audited (#1998).
