# Text field

Text field. Filled has a filled background; outlined has an outline.

Annotation type: `text-field` (layer Components).

## Fields

| Key                       | Label                     | Type   | Required | Options                                                   | Default  | Description                                                                                                                                                                                                                                                                       |
| ------------------------- | ------------------------- | ------ | -------- | --------------------------------------------------------- | -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `label`                   | Label                     | string | yes      |                                                           |          | Floating label of the field.                                                                                                                                                                                                                                                      |
| `value`                   | Value                     | string | no       |                                                           |          | Text typed in the field.                                                                                                                                                                                                                                                          |
| `placeholder`             | Hint                      | string | no       |                                                           |          | Hint text when the field is empty.                                                                                                                                                                                                                                                |
| `supportingText`          | Supporting text           | string | no       |                                                           |          | Supporting or error text below the field.                                                                                                                                                                                                                                         |
| `style`                   | Style                     | enum   | no       | `filled`, `outlined`                                      | `filled` | filled (TextField) or outlined (OutlinedTextField).                                                                                                                                                                                                                               |
| `enabled`                 | Enabled                   | enum   | no       | `true`, `false`                                           | `true`   | false disables the field.                                                                                                                                                                                                                                                         |
| `interaction`             | Interaction               | enum   | no       | `none`, `hovered`, `focused`                              | `none`   | Resting appearance of the interaction state: hovered or focused (focused: 2 indicator or outline in primary and label in primary); none = no highlight. It only changes the drawing and does not go into the code. With enabled false nothing is drawn (the disabled state wins). |
| `isError`                 | Error                     | enum   | no       | `true`, `false`                                           | `false`  | true paints the field as an error.                                                                                                                                                                                                                                                |
| `singleLine`              | Single line               | enum   | no       | `true`, `false`                                           | `false`  | true limits the field to one line.                                                                                                                                                                                                                                                |
| `maxLines`                | Max lines                 | number | no       |                                                           |          | Line limit (Int). Empty = no limit.                                                                                                                                                                                                                                               |
| `leadingIcon`             | Leading icon              | string | no       | free text; icon suggestions (`Home`, `Search`, `Person`…) |          | Icon before the text. Empty = no icon.                                                                                                                                                                                                                                            |
| `leadingIconDescription`  | Leading icon description  | string | no       | free text                                                 |          | Accessible description of the leading icon, read by a screen reader. Empty = the icon is decorative and is not announced.                                                                                                                                                         |
| `trailingIcon`            | Trailing icon             | string | no       | free text; icon suggestions (`Home`, `Search`, `Person`…) |          | Icon after the text. Empty = no icon.                                                                                                                                                                                                                                             |
| `trailingIconDescription` | Trailing icon description | string | no       | free text                                                 |          | Accessible name of the trailing icon (it is an action): what a screen reader reads ("Search", "Open the menu"). Empty = a pending item.                                                                                                                                           |
| `width`                   | Width                     | enum   | no       | `wrap`, `fill`, `fixed`                                   | `wrap`   | wrap fits the content, fill takes all the available width and fixed uses the marking width (dp).                                                                                                                                                                                  |
| `height`                  | Height                    | enum   | no       | `wrap`, `fill`, `fixed`                                   | `wrap`   | wrap fits the content, fill takes all the available height and fixed uses the marking height (dp).                                                                                                                                                                                |
| `weight`                  | Weight                    | number | no       |                                                           |          | Share of the leftover space in a Row or Column (Modifier.weight). Empty = no weight.                                                                                                                                                                                              |

## Compose

- Symbol: `androidx.compose.material3.TextField`
- File (`path`): `compose/material3/material3/src/commonMain/kotlin/androidx/compose/material3/TextField.kt`
- The `style` field chooses the symbol; values without their own case use the base one.

| `style`         | Symbol                                            |
| --------------- | ------------------------------------------------- |
| `filled` (base) | `TextField`                                       |
| `outlined`      | `OutlinedTextField` (file `OutlinedTextField.kt`) |

How the annotation becomes the call (the values below are examples; the parameter names and expressions are those of `params` and `values` in `code`):

```kotlin
TextField(    // style outlined: OutlinedTextField (same parameters)
    value = value,                  // screen state
    onValueChange = { value = it },
    enabled = true,
    isError = false,
    singleLine = true,
    label = { Text("Email") },
    placeholder = { Text("name@example.com") },
    supportingText = { Text("Supporting text") },
    leadingIcon = { Icon(Icons.Filled.Email, contentDescription = null) },
    modifier = Modifier.fillMaxWidth(),
)
```

`code` notes (what the tool hands to the agent):

> `value` and `onValueChange` bind to a screen state. A filled `label`, `placeholder` and `supportingText` become `{ Text(<field>) }`; `leadingIcon` and `trailingIcon` become `{ Icon(Icons.Filled.<name>, contentDescription = null) }`. `maxLines` is only included when filled; filled and outlined do not require opt-in. Size: `fill` becomes `Modifier.fillMaxWidth()`/`fillMaxHeight()`, `fixed` becomes `Modifier.width(<marking width>.dp)`/`height(<marking height>.dp)` and `weight` becomes `Modifier.weight(<weight>f)` (only inside Row, Column or FlowRow).

## Examples

- **Filled**: label=Name, style=filled
- **Outlined with hint**: label=Email, placeholder=name@example.com, style=outlined, leadingIcon=Email, singleLine=true
- **Error**: label=Password, value=123, supportingText=At least 8 characters, style=outlined, isError=true, trailingIcon=Lock, trailingIconDescription=Lock
- **Hovered**: label=Name, value=Maria Silva, style=filled, interaction=hovered
- **Focused**: label=Email, value=name@example.com, style=outlined, interaction=focused
- **Filled with supporting text**: label=Name, supportingText=As it appears on your profile, style=filled

## Fidelity

Reference: Compose `material3` 1.4.0, commit `5113b82a4ed6416d6344efa50e41db8cb65928ff` (decisions 1 to 3 of the faithful Material 3 stage). 1 dp = 1 component unit; the container density converts it to image pixels (`docs/COMPONENT-FORMAT.md`, "Units and density"). The values come from the specialization tokens (`tokens`, in the `light` and `dark` modes), which mirror the androidx token files; no color, font or radius is literal in the component, and no text node declares `family` (all inherit `font-sans`).

**Files used**

- `compose/material3/material3/src/commonMain/kotlin/androidx/compose/material3/TextFieldDefaults.kt` (lines 66 to 87: shape `FilledTextFieldTokens.ContainerShape`, `MinHeight` 56, `MinWidth` 280 and the indicator thicknesses, 1 unfocused and 2 focused; 440 to 471: `contentPaddingWithLabel`, `contentPaddingWithoutLabel` and `supportingTextPadding`; 636 to 710: the filled `TextFieldColors`; 885 to 906: the outlined shape and thicknesses; 1364 to 1453: the outlined `TextFieldColors`).
- `compose/material3/material3/src/commonMain/kotlin/androidx/compose/material3/TextField.kt` (lines 700 to 805: `TextFieldLayout`, with the icon in a 48 area and the text at `16 - 12 = 4` from the icon; 1471 to 1560: `IndicatorLineNode`, the filled bottom line; 1662: `TextFieldWithLabelVerticalPadding` 8).
- `compose/material3/material3/src/commonMain/kotlin/androidx/compose/material3/OutlinedTextField.kt` (lines 236 to 262: `padding(top = minimizedLabelHalfHeight())` and `defaultMinSize` 280 by 56; 1289 to 1355: minimized label position, `y = -(height / 2)` and `x = 16`; 1406 to 1437: `outlineCutout`, the outline gap with 4 of slack on each side of the label).
- `compose/material3/material3/src/commonMain/kotlin/androidx/compose/material3/internal/TextFieldImpl.kt` (lines 139 to 150: the label goes from `bodyLarge` to `bodySmall` when minimized; 521 to 542: `TextFieldPadding` 16, `SupportingTopPadding` 4, `MinTextLineHeight` 24, `MinFocusedLabelLineHeight` 16, `MinSupportingTextLineHeight` 16).
- `compose/material3/material3/src/commonMain/kotlin/androidx/compose/material3/tokens/FilledTextFieldTokens.kt` (container `SurfaceContainerHighest` with shape `CornerExtraSmallTop`, 1 indicator, color roles for label, text, support text and icons, disabled opacities) and `tokens/OutlinedTextFieldTokens.kt` (`ContainerHeight` 56, `ContainerShape` `CornerExtraSmall`, `OutlineWidth` 1, `OutlineColor`, `ErrorOutlineColor`, `DisabledOutlineOpacity` 0.12).
- `compose/material3/material3/src/commonMain/kotlin/androidx/compose/material3/tokens/FilledTextFieldTokens.kt` (lines 45 to 73: the `Focus*`, `Hover*`, `ErrorFocus*` and `ErrorHover*` roles) and `compose/material3/material3/src/commonMain/kotlin/androidx/compose/material3/tokens/OutlinedTextFieldTokens.kt` (lines 42 to 70: the same, plus `FocusOutlineWidth`).
- `compose/material3/material3/src/commonMain/kotlin/androidx/compose/material3/tokens/StateTokens.kt` (lines 22 to 25: `HoverStateLayerOpacity`, `FocusStateLayerOpacity`, `PressedStateLayerOpacity`; `DraggedStateLayerOpacity` 0.16 is the `state-dragged`).

**How the drawing follows Compose**

- Field 56 high (`minHeight` of the container) and a floor of 280 wide (the root `minSize` and `minWidth`). The outlined adds the 8 above from `padding(top = minimizedLabelHalfHeight())`, so its container is at least 64 and the outline 56.
- **Height by style and support text:** `sizing.height` is an expression (`$switch` by `style`, `$if` with `$has` of `supportingText`), without the empty pixels of before: filled 56 without support text and 76 with it (56 + 4 + 16); outlined 64 without support text (8 + 56) and 84 with it (8 + 56 + 4 + 16). The 4 above the support text is the `SupportingTopPadding` (`TextFieldDefaults.kt` lines 466 to 470) and the 16 the `MinSupportingTextLineHeight` (`TextField.kt` lines 797 to 801); the outlined's 8 is the `padding(top = minimizedLabelHalfHeight())` (`OutlinedTextField.kt` lines 244 to 252). The `size` stays 280 by 84 (that of the outlined with support text, the largest); Arrange and `fit_marking` take the height to the expression value and keep the width.
- **Root width limit:** `minWidth` 280 (`defaultMinSize(minWidth = MinWidth, minHeight = MinHeight)`, `TextField.kt` lines 305 to 308 and `OutlinedTextField.kt` lines 257 to 260; `TextFieldDefaults.kt` lines 81 and 900). It applies when the width is measured (`measureComponent`, the fit with free width): it never goes below 280.
- Filled: `surface-container-highest` background with top radius `corner-extra-small` and a 1 indicator, only on the bottom edge, through `stroke.sides: ["bottom"]` (no 1-high rectangle). Indicator color `on-surface-variant`, `error` on error.
- Outlined: 1 outline with radius `corner-extra-small`, color `outline` and `error` on error; the container is transparent.
- Label: `body-large` (16/24, `body-large-tracking` 0.5) when the field is empty and `body-small` (12/16, 0.4) when there is a value or hint. In filled it sits above the value (8 from the top); in outlined, minimized, it goes into the outline gap, at x = 16 and centered on the top line. Color `on-surface-variant`, `error` on error.
- Outline gap (outlined with value or hint): the outline is a single node, with radius `corner-extra-small` on all four corners, and the `stroke.gap` (`node` the minimized label, `padding` 4) interrupts the top side where the label box crosses it, plus 4 on each side, like the `outlineCutout` of `OutlinedTextField.kt` (lines 1405 to 1435, `OutlinedTextFieldInnerPadding` = 4 dp); it is a real gap, with no patch in the background color, and the corners next to it stay round.
- Value and hint in `body-large`; value `on-surface`, hint `on-surface-variant` (also on error, like `errorPlaceholderColor`). With `singleLine`, the value stays on one line, with no wrapping or ellipsis (`font.wrap: "none"`, `maxLines: 1`) and is clipped at the width; without `singleLine`, it wraps by word and `maxLines` (field) cuts at the requested lines, with no ellipsis. `singleLine` wins over `maxLines`, as in `BasicTextField`.
- Label and support text wrap by word, with no `maxLines` or ellipsis, like the Compose `Text`.
- Leading icon 12 from the edge and text at 52 (48 icon area plus 4); without an icon the text starts at 16. The trailing icon mirrors: 12 from the edge. The icons are the 24 `icon` node, chosen by the field's `$switch`.
- `body-small` support text, 4 from the field and with 16 on the sides. Color `on-surface-variant`, `error` on error.
- Leading icon `on-surface-variant` (also on error, like `errorLeadingIconColor`); trailing icon `on-surface-variant`, `error` on error.
- Disabled: label, value, hint, support text and icons in `on-surface` at 0.38 (`state-disabled-content`); filled indicator in `on-surface` at 0.38; outlined outline in `on-surface` at 0.12 (`state-disabled-container`). Disabled wins over error.
- Label (the large and the minimized one), hint and single-line value are centered by the cap height (`font.verticalAlign: "cap-middle"`; the value only with `singleLine`, the multi-line one stays at the top). The Compose `Text` centers by the font line box; with Roboto the two coincide to within 1 px.

**Interaction state (`interaction` field)**

The field chooses the resting appearance of a state, as `enabled` chooses the disabled state; it does not go into the `code` or the `variants`. The options are `none`, `hovered` and `focused`: the field tokens (`FilledTextFieldTokens.kt` and `OutlinedTextFieldTokens.kt`) define `Hover*` and `Focus*` and no `Pressed*` or `Dragged*`, so there is no `pressed` or `dragged`.

- **Filled, focused** (`FilledTextFieldTokens.kt`, lines 63 to 66): the bottom indicator goes to 2 thick (`FocusActiveIndicatorHeight`) in `primary` (`FocusActiveIndicatorColor`) and the label goes to `primary` (`FocusLabelColor`). In error, the indicator and the label stay in `error` (`ErrorFocusActiveIndicatorColor` and `ErrorFocusLabelColor`, lines 45 and 48).
- **Outlined, focused** (`OutlinedTextFieldTokens.kt`, lines 60 to 63): the outline goes to 2 (`FocusOutlineWidth`) in `primary` (`FocusOutlineColor`), including the top side around the label gap, and the label goes to `primary` (`FocusLabelColor`). In error, `error` (`ErrorFocusOutlineColor` and `ErrorFocusLabelColor`, lines 42 and 44).
- **Filled, hovered** (`FilledTextFieldTokens.kt`, lines 70 to 73): the indicator goes to `on-surface` (`HoverActiveIndicatorColor`), still 1 thick (`HoverActiveIndicatorHeight`); the label stays `on-surface-variant` (`HoverLabelColor`). In error, the indicator, the label and the trailing icon go to `on-error-container` (`ErrorHoverActiveIndicatorColor`, `ErrorHoverLabelColor` and `ErrorHoverTrailingIconColor`, lines 52, 54 and 57).
- **Outlined, hovered** (`OutlinedTextFieldTokens.kt`, lines 67 to 69): the outline and the label go to `on-surface` (`HoverOutlineColor` and `HoverLabelColor`), with a width of 1. In error, the outline, the label and the trailing icon go to `on-error-container` (lines 48, 50 and 52).
- **No change:** the text (`on-surface`), the leading icon (`on-surface-variant`), the support text and the container repeat the usual roles in both states (`Hover*` and `Focus*` of `InputColor`, `LeadingIconColor` and `SupportingColor`); the trailing icon only changes on error with the mouse.
- **Disabled wins:** with `enabled` `false` the `interaction` changes neither color nor thickness, so the drawing is the disabled one, whatever the state.
- **Same layout:** the 2 indicator and outline sit inside (`align` `inside`); the text and the field do not move.

**What still differs from Compose**

- The `interaction` is a still frame: no real focus, cursor, selection, `pressed` or label animation (the label only gets small with a value or hint). Compose defines no focus ring for this type at the pinned commit (none of its `*Tokens.kt` carries `FocusIndicatorColor`): none is drawn.
- The drawing shows the hint with the minimized label; in Compose the hint only appears with focus (without focus, empty, the label stays expanded and the hint disappears).
- The filled disabled container follows the code (`TextFieldDefaults.colors` uses `ContainerColor` when disabled too), not the 0.04 `DisabledContainerOpacity` token over `on-surface`.
- The outlined outline gap is the `stroke.gap` of the `outline` node; its width is that of the minimized label box measured at arrangement, not Compose's animated `labelSize`. With no value or hint the label stays inside the field and the outline opens no gap.
- The filled top radius is the list of 4 radii with `$token` per item (`corner-extra-small` on top, 0 at the bottom), with no taller clipped rectangle.
- The field width is `fill` in `sizing` (like the `fillMaxWidth()` of Material screens): on a marking with a rectangle the root takes the box and the root `minWidth` of 280 changes nothing, like the `minSize`; Arrange does not touch the width. The height comes from `sizing`, but only counts one line of support text (16): support text that wraps into two lines overflows the fitted box (Compose grows the field with the lines).
- `singleLine` shows the start of the text (the `BasicTextField` scrolls to the cursor); `maxLines` cuts the text, with no vertical scrolling.
- No counter, `labelPosition` above, 48 touch target for the icons and the other `TextField` parameters.

**Accessibility** (stage #1081; the unit is the dp, 1 dp = 1 component unit): the type has `accessibility.role` `textbox`, with the `label` and the `placeholder` as accessible name. It declares its own `touchTarget` `visual` (48 × 48): Compose does not expand the field itself (`minimumInteractiveComponentSize` only on its icons: `compose/material3/material3/src/commonMain/kotlin/androidx/compose/material3/TextField.kt` (lines 701 and 709) and `compose/material3/material3/src/commonMain/kotlin/androidx/compose/material3/OutlinedTextField.kt` (lines 688 and 696)), so the 48 is audited on the drawn rectangle and a field that is drawn smaller is reported. The leading icon is an `image` part and the trailing icon a `button` part, each with its optional description field (`leadingIconDescription` and `trailingIconDescription`); the trailing icon is the one that Compose expands.
