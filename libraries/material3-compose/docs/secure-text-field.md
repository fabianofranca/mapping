# Secure text field

Password field: the typed text is masked. Filled has a filled background; outlined has an outline.

Annotation type: `secure-text-field` (layer Components).

## Fields

| Key              | Label           | Type   | Required | Options                                                   | Default  | Description                                                                                                                                                                                                                                                                       |
| ---------------- | --------------- | ------ | -------- | --------------------------------------------------------- | -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `label`          | Label           | string | yes      |                                                           |          | Floating label of the field.                                                                                                                                                                                                                                                      |
| `hasText`        | With typed text | enum   | no       | `true`, `false`                                           | `false`  | true shows the field filled, with the characters masked (or hidden). It only affects the drawing: the text lives in the TextFieldState, not in the annotation.                                                                                                                    |
| `placeholder`    | Hint            | string | no       |                                                           |          | Hint text when the field is empty.                                                                                                                                                                                                                                                |
| `supportingText` | Supporting text | string | no       |                                                           |          | Supporting or error text below the field.                                                                                                                                                                                                                                         |
| `style`          | Style           | enum   | no       | `filled`, `outlined`                                      | `filled` | filled (SecureTextField) or outlined (OutlinedSecureTextField).                                                                                                                                                                                                                   |
| `enabled`        | Enabled         | enum   | no       | `true`, `false`                                           | `true`   | false disables the field.                                                                                                                                                                                                                                                         |
| `interaction`    | Interaction     | enum   | no       | `none`, `hovered`, `focused`                              | `none`   | Resting appearance of the interaction state: hovered or focused (focused: 2 indicator or outline in primary and label in primary); none = no highlight. It only changes the drawing and does not go into the code. With enabled false nothing is drawn (the disabled state wins). |
| `isError`        | Error           | enum   | no       | `true`, `false`                                           | `false`  | true paints the field as an error.                                                                                                                                                                                                                                                |
| `leadingIcon`    | Leading icon    | string | no       | free text; icon suggestions (`Home`, `Search`, `Person`…) |          | Icon before the text. Empty = no icon.                                                                                                                                                                                                                                            |
| `trailingIcon`   | Trailing icon   | string | no       | free text; icon suggestions (`Home`, `Search`, `Person`…) |          | Icon after the text, usually the show or hide password button. Empty = no icon.                                                                                                                                                                                                   |
| `width`          | Width           | enum   | no       | `wrap`, `fill`, `fixed`                                   | `wrap`   | wrap fits the content, fill takes all the available width and fixed uses the marking width (dp).                                                                                                                                                                                  |
| `height`         | Height          | enum   | no       | `wrap`, `fill`, `fixed`                                   | `wrap`   | wrap fits the content, fill takes all the available height and fixed uses the marking height (dp).                                                                                                                                                                                |
| `weight`         | Weight          | number | no       |                                                           |          | Share of the leftover space in a Row or Column (Modifier.weight). Empty = no weight.                                                                                                                                                                                              |

## Compose

- Symbol: `androidx.compose.material3.SecureTextField`
- File (`path`): `compose/material3/material3/src/commonMain/kotlin/androidx/compose/material3/SecureTextField.kt`
- The `style` field chooses the symbol; values without their own case use the base one.

| `style`         | Symbol                    |
| --------------- | ------------------------- |
| `filled` (base) | `SecureTextField`         |
| `outlined`      | `OutlinedSecureTextField` |

How the annotation becomes the call (the values below are examples; the parameter names and expressions are those of `params` and `values` in `code`):

```kotlin
var showPassword by remember { mutableStateOf(false) }
SecureTextField(    // style outlined: OutlinedSecureTextField (same parameters)
    state = rememberTextFieldState(),    // holds the typed text
    enabled = true,
    isError = false,
    label = { Text("Password") },
    supportingText = { Text("At least 8 characters") },
    leadingIcon = { Icon(Icons.Filled.Lock, contentDescription = null) },
    textObfuscationMode = if (showPassword) TextObfuscationMode.Visible else TextObfuscationMode.RevealLastTyped,
    modifier = Modifier.fillMaxWidth(),
)
```

`code` notes (what the tool hands to the agent):

> Stable, no opt-in. Instead of `value`/`onValueChange`, the field takes `state = rememberTextFieldState()` (`androidx.compose.foundation.text.input.TextFieldState`), which holds the text; `hasText` only affects the drawing and is not a parameter. A filled `label`, `placeholder` and `supportingText` become `{ Text(<field>) }`; `leadingIcon` and `trailingIcon` become `{ Icon(Icons.Filled.<name>, contentDescription = null) }` (to show and hide the password, bind the icon to a `textObfuscationMode` that toggles `TextObfuscationMode.Visible` and `TextObfuscationMode.RevealLastTyped`). Size: `fill` becomes `Modifier.fillMaxWidth()`/`fillMaxHeight()`, `fixed` becomes `Modifier.width(<marking width>.dp)`/`height(<marking height>.dp)` and `weight` becomes `Modifier.weight(<weight>f)` (only inside Row, Column or FlowRow).

## Examples

- **Filled**: label=Password, style=filled
- **Outlined with text**: label=Password, hasText=true, style=outlined, leadingIcon=Lock, trailingIcon=Done
- **Error**: label=Password, hasText=true, supportingText=Incorrect password, style=outlined, isError=true
- **Hovered**: label=Password, hasText=true, style=outlined, interaction=hovered
- **Focused**: label=Password, hasText=true, style=filled, interaction=focused
- **Filled with supporting text**: label=Password, supportingText=At least 8 characters, style=filled

## Fidelity

Reference: Compose `material3` 1.4.0, commit `5113b82a4ed6416d6344efa50e41db8cb65928ff` (decisions 1 to 3 of the faithful Material 3 stage). 1 dp = 1 component unit; the container density converts it to image pixels (`docs/COMPONENT-FORMAT.md`, "Units and density"). The values come from the specialization tokens (`tokens`, in the `light` and `dark` modes), which mirror the androidx token files; no color, font or radius is literal in the component, and no text node declares `family` (all inherit `font-sans`).

**Files used**

- The same as `text-field` (`TextFieldDefaults.kt`, `TextField.kt`, `OutlinedTextField.kt`, `internal/TextFieldImpl.kt`, `tokens/FilledTextFieldTokens.kt` and `tokens/OutlinedTextFieldTokens.kt`; lines in `docs/text-field.md`), because `SecureTextField` and `OutlinedSecureTextField` use the same `TextFieldDefaults.decorator` decorator and the same colors.
- `compose/material3/material3/src/commonMain/kotlin/androidx/compose/material3/TextField.kt` (the `SecureTextField` overloads, with `TextFieldLineLimits.SingleLine`) and `OutlinedTextField.kt` (`OutlinedSecureTextField`).
- `compose/material3/material3/src/commonMain/kotlin/androidx/compose/material3/tokens/FilledTextFieldTokens.kt` (lines 45 to 73: the `Focus*`, `Hover*`, `ErrorFocus*` and `ErrorHover*` roles) and `compose/material3/material3/src/commonMain/kotlin/androidx/compose/material3/tokens/OutlinedTextFieldTokens.kt` (lines 42 to 70: the same, plus `FocusOutlineWidth`).
- `compose/material3/material3/src/commonMain/kotlin/androidx/compose/material3/tokens/StateTokens.kt` (lines 22 to 25: `HoverStateLayerOpacity`, `FocusStateLayerOpacity`, `PressedStateLayerOpacity`; `DraggedStateLayerOpacity` 0.16 is the `state-dragged`).

**How the drawing follows Compose**

- Everything `text-field` draws: 56 field, filled with `surface-container-highest` background, top radius `corner-extra-small` and a 1 indicator only at the bottom through `stroke.sides: ["bottom"]`; outlined with a 1 outline, radius `corner-extra-small`, 8 above the label and a real gap in the outline (`stroke.gap` over the minimized label, rounded corners); `body-large` label or minimized `body-small`; `body-small` support text; 24 icons by the `icon` node; the same error and disabled colors (0.38 and 0.12).
- **Height and width:** those of `text-field` (`sizing.height` by expression, `minWidth` 280 on the root): filled 56 without support text and 76 with it (56 + 4 + 16), outlined 64 without support text (8 + 56) and 84 with it (8 + 56 + 4 + 16); the `size` stays 280 by 84. The `SecureTextField` has the same `defaultMinSize(TextFieldDefaults.MinWidth, MinHeight)` (`SecureTextField.kt` lines 173 to 176) and the same support text (`TextFieldDefaults.kt` lines 466 to 470, `TextField.kt` lines 797 to 801); the `OutlinedSecureTextField` adds the 8 above the label (`OutlinedTextField.kt` lines 244 to 260).
- Typed text: with `hasText`, eight `•` in `body-large` and `on-surface`, on a single line, with no wrapping or ellipsis (the secure field is always `SingleLine`) and clipped at the width. Without `hasText`, the hint appears (minimized label) or just the expanded label.
- The label (large and minimized), the hint and the eight `•` of the value are centered by the cap height (`font.verticalAlign: "cap-middle"`). The Compose `Text` centers by the font line box; with Roboto the two coincide to within 1 px.

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

- The same differences as `text-field`: the `interaction` is a still frame (no real focus, cursor, `pressed` or label animation; no focus ring (Compose does not define `FocusIndicatorColor` for it at the pinned commit); the hint is shown with the minimized label; filled top radius from the list of 4 radii with `$token` per item; filled disabled container as in the code (`ContainerColor`), not the 0.04 of the token; the `size` is 84 (the outlined one with support text) and the height comes from `sizing`, which only counts one line of support text (two-line support text overflows the fitted box); the width is `fill` in `sizing`, so the root `minWidth` of 280 only acts when the width is measured.
- The eight `•` are fixed: Compose draws one per typed character and, with `RevealLastTyped`, shows the last one for a moment.
- No show or hide password icon: it is the `trailingIcon` that the screen chooses.
