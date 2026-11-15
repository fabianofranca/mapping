# Alert dialog

Dialog that interrupts the flow to ask for a decision or give information: optional icon, title, text and up to two text buttons. Standard assembles the content; basic leaves the content to the caller.

Annotation type: `alert-dialog` (Components layer).

## Fields

| Key                  | Label            | Type   | Required | Options                                                   | Default    | Description                                                                                                                                          |
| -------------------- | ---------------- | ------ | -------- | --------------------------------------------------------- | ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| `style`              | Style            | enum   | no       | `standard`, `basic`                                       | `standard` | standard (AlertDialog, with title, text and buttons) or basic (BasicAlertDialog, only the window: the content is built by hand and requires opt-in). |
| `title`              | Title            | string | no       |                                                           |            | Dialog title. Empty = no title.                                                                                                                      |
| `text`               | Text             | string | no       |                                                           |            | Supporting text with the details. Empty = no text.                                                                                                   |
| `confirmButton`      | Confirm button   | string | yes      |                                                           |            | Label of the button that confirms the action (required in AlertDialog).                                                                              |
| `dismissButton`      | Dismiss button   | string | no       |                                                           |            | Label of the button that dismisses the dialog. Empty = only the confirm button.                                                                      |
| `icon`               | Icon             | string | no       | free text; icon suggestions (`Home`, `Search`, `Person`…) |            | Icon above the title. Empty = no icon.                                                                                                               |
| `contentDescription` | Icon description | string | no       |                                                           |            | Accessibility text of the icon (goes into the Icon's `contentDescription`). Empty = decorative icon.                                                 |

## Compose

- Symbol: `androidx.compose.material3.AlertDialog`
- File (`path`): `compose/material3/material3/src/commonMain/kotlin/androidx/compose/material3/AlertDialog.kt`
- The `style` field chooses the symbol; values without their own case use the base one.

| `style`           | Symbol             |
| ----------------- | ------------------ |
| `standard` (base) | `AlertDialog`      |
| `basic`           | `BasicAlertDialog` |

How the annotation becomes the call (the values below are examples; the parameter names and expressions are those of `params` and `values` in the `code`):

```kotlin
// style standard: AlertDialog
if (showDialog) {
    AlertDialog(
        onDismissRequest = { showDialog = false },
        confirmButton = {
            TextButton(onClick = { /* screen logic */ }) { Text("Discard") }
        },
        dismissButton = {
            TextButton(onClick = { showDialog = false }) { Text("Cancel") }
        },
        icon = { Icon(Icons.Filled.Delete, contentDescription = null) },
        title = { Text("Discard draft?") },
        text = { Text("The draft will be deleted and cannot be recovered.") },
    )
}

// style basic: BasicAlertDialog (@OptIn(ExperimentalMaterial3Api::class)), content built by hand
BasicAlertDialog(onDismissRequest = { showDialog = false }) {
    Surface(
        shape = AlertDialogDefaults.shape,
        tonalElevation = AlertDialogDefaults.TonalElevation,
    ) {
        Column(Modifier.padding(24.dp)) {
            Text("Sign out?", style = MaterialTheme.typography.headlineSmall)
            Spacer(Modifier.height(16.dp))
            Text("You will need to sign in again to see your messages.")
            Spacer(Modifier.height(24.dp))
            Row(Modifier.align(Alignment.End)) {
                TextButton(onClick = { showDialog = false }) { Text("Cancel") }
                TextButton(onClick = { /* screen logic */ }) { Text("Sign out") }
            }
        }
    }
}
```

Notes from the `code` (what the tool hands to the agent):

> Stable, no opt-in: use the overload with `confirmButton` (the `content` one is `@Deprecated` and experimental). `AlertDialog(onDismissRequest = { … }, confirmButton = { TextButton(onClick = { … }) { Text(<confirmButton>) } }, dismissButton = { TextButton(onClick = { … }) { Text(<dismissButton>) } }, icon = { … }, title = { Text(<title>) }, text = { Text(<text>) })`. `dismissButton`, `icon`, `title` and `text` are only included when the field is filled in (the parameters are optional and `null` by default). `onDismissRequest` closes the dialog (clears the state that shows it) and is not called by the buttons. With `icon` filled in: `icon = { Icon(Icons.Filled.<icon>, contentDescription = <contentDescription>) }` (without `contentDescription`, pass `null`); with an icon, the title is centered. The width goes from 280 to 560 dp by content and the dialog is a window over the screen, not part of the layout: declare it where the state that opens it lives (`if (showDialog) AlertDialog(…)`).

`basic` variant: Requires @OptIn(ExperimentalMaterial3Api::class) (`BasicAlertDialog` is experimental in the pinned commit). It only opens the window: `BasicAlertDialog(onDismissRequest = { … }) { … }`, and the content has no style of its own. To look like the M3 dialog, build `Surface(shape = AlertDialogDefaults.shape, tonalElevation = AlertDialogDefaults.TonalElevation) { Column(Modifier.padding(24.dp)) { … } }` with `Text(<title>, style = MaterialTheme.typography.headlineSmall)`, `Text(<text>, style = MaterialTheme.typography.bodyMedium)` and a `Row(Modifier.align(Alignment.End))` with `TextButton`s for `dismissButton` and `confirmButton` (24 dp of spacing between the parts and 8 dp between the buttons). With `icon` filled in, the icon goes before the title, centered: `Icon(Icons.Filled.<icon>, contentDescription = <contentDescription>)` (without `contentDescription`, pass `null`).

## Examples

- **Confirmation with icon**: style=standard, icon=Delete, title=Discard draft?, text=The draft will be deleted and cannot be recovered., confirmButton=Discard, dismissButton=Cancel
- **Information only**: style=standard, title=Sync complete, text=Your data is up to date on all devices., confirmButton=OK
- **Basic with title and text**: style=basic, title=Sign out?, text=You will need to sign in again to see your messages., confirmButton=Sign out, dismissButton=Cancel
- **Buttons on two lines**: style=standard, title=Discard draft?, text=The draft will be deleted., confirmButton=Discard the draft now, dismissButton=Cancel

## Fidelity

Reference: Compose `material3` 1.4.0, commit `5113b82a4ed6416d6344efa50e41db8cb65928ff` (decisions 1 to 3 of the faithful Material 3 stage). 1 dp = 1 component unit; the container density converts to image pixels (`docs/COMPONENT-FORMAT.md`, "Units and density"). The values come from the specialization tokens (`tokens`, in the `light` and `dark` modes), which mirror the androidx token files; no color, font, radius or opacity is literal in the component, no text node declares `family` (all inherit `font-sans`) and the icon is the `icon` node of the library set, through the `$switch` from the Compose name to the set one, with no SVG path in the component.

**Files used**

- `compose/material3/material3/src/commonMain/kotlin/androidx/compose/material3/AlertDialog.kt` (lines 94 to 110: `AlertDialog` and the order of the slots; 219 to 242: `AlertDialogDefaults`, the shape, the colors and `TonalElevation` = 0 dp; 246 to 292: `AlertDialogImpl`, the token `buttonContentColor`; 295 to 369: `AlertDialogContent`, the `Surface` without `shadowElevation`, the `Column` with `padding(DialogPadding)`, the icon in the `Box` with `IconPadding` and `align(CenterHorizontally)`, the title with `TitlePadding` and centered when there is an icon, the text with `TextPadding` and `align(Start)`, the buttons in a `Box` with `align(End)`; 375 to 466: `AlertDialogFlowRow`, 8 of space between the buttons and 12 between the rows, the confirm button above the dismiss one; 468 to 478: `DialogMinWidth` 280, `DialogMaxWidth` 560, `ButtonsMainAxisSpacing` 8, `ButtonsCrossAxisSpacing` 12, `DialogPadding` 24, `IconPadding`, `TitlePadding` 16 and `TextPadding` 24).
- `compose/material3/material3/src/commonMain/kotlin/androidx/compose/material3/tokens/DialogTokens.kt` (lines 26 and 27: buttons in `Primary` and `LabelLarge`; 29 to 31: container `SurfaceContainerHigh`, `ContainerElevation` `Level3` (not applied by the composable) and shape `CornerExtraLarge`; 32 and 33: title in `OnSurface` and `HeadlineSmall`; 34 and 35: text in `OnSurfaceVariant` and `BodyMedium`; 36 and 37: 24 icon in `Secondary`).
- `compose/material3/material3/src/commonMain/kotlin/androidx/compose/material3/Button.kt` (lines 143 to 147: `defaultMinSize(minWidth = MinWidth, minHeight = MinHeight)`; 418 to 440: `TextButton`; 497 to 510: `TextButtonContentPadding` with 12 on each side; 527 and 533: `MinWidth` 58 and `MinHeight` 40) and `Surface.kt` (line 219: `minimumInteractiveComponentSize()` of the clickable `Surface`, which takes the `TextButton` to 48 tall in the layout).
- `compose/material3/material3/src/commonMain/kotlin/androidx/compose/material3/tokens/TypeScaleTokens.kt` (`HeadlineSmall` 24/32/400/0, `BodyMedium` 14/20/400/0.2 and `LabelLarge` 14/20/500/0.1) and `ShapeTokens.kt` (line 29: `CornerExtraLarge` 28).

**How the drawing follows Compose**

- `surface-container-high` container with `corner-extra-large` (28) and 24 of padding on all four sides, no shadow: the dialog `Surface` has `tonalElevation` 0 and no `shadowElevation`, so the token's `Level3` is not drawn.
- 24 icon from the set in `secondary` (`IconColor`), centered, with 16 down to the title. Title in `headline-small` (24/32, weight 400) in `on-surface`, 16 from the text, centered when there is an icon and left-aligned without it. Text in `body-medium` (14/20) in `on-surface-variant`, 24 from the buttons. Everything through the typography tokens, without `family`.
- Text buttons on the right, the dismiss one before the confirm one and 8 between them. Each is a `TextButton`: label in `label-large` (14/20, weight 500, spacing 0.1) in `primary`, 12 on each side (`TextButtonContentPadding`), minimum width of 58 (`ButtonDefaults.MinWidth`, the frame's `minWidth`) and minimum height of 40 (`ButtonDefaults.MinHeight`), with 24 to the bottom edge, as in Material. The button height hugs the label (`hug`): 8 of breathing room above and below (`TextButtonContentPadding`, `Button.kt` lines 469 and 504 to 510) and the minimum of 40 (lines 143 to 148); each button sits in a `touch target (<button>)` frame of at least 48, the `TextButton` touch target (`minimumInteractiveComponentSize`), with the 40 button centered in it, and the row of buttons hugs those frames (and also has the minimum of 48). A label longer than the row width wraps into lines of 20 (the `label content`, a `hug` column, limits the text to the parent width) and the button, the row and the dialog grow along with it: 3 lines give a button of 76.
- The buttons wrap into lines like the `AlertDialogFlowRow`: the row of buttons is `wrap-reverse`, with 8 between the buttons on the same line (`ButtonsMainAxisSpacing`, the `gap`) and 12 between the lines (`ButtonsCrossAxisSpacing`, the `lineGap`). When the two do not fit in the row width, the dismiss one stays on the bottom line and the confirm one goes to the top one, both on the right (`justify: end` applies to each line), and the row and the dialog grow: 48 + 12 + 48.
- Width from 280 to 560 (`DialogMinWidth` and `DialogMaxWidth`, the root's `minWidth` and `maxWidth`) and a height that hugs the content (`sizing` with `height: "hug"`). The width `sizing` stays 312, the Material starting value.
- The `basic` style draws the same dialog: `BasicAlertDialog` only opens the window and the Compose example builds the content with the same shape, the same 24 of padding and the same spaces.
- Single-line label centered by the capital letter (`cap-middle`): the `label` node of both buttons uses `font.verticalAlign: "cap-middle"` and its box is that of the lines (`hug`), centered in the button height like the `TextButton`'s `Row` (`verticalAlignment = CenterVertically`, `Button.kt` line 150). Compose's `Text` centers by the font's line box (ascent and descent); the drawing centers the capital height in the box, and with Roboto the two coincide to within 1 px.

**What still differs from Compose**

- The wrapping of the button lines starts from the natural size of each button (the label on a single line), the `wrap` rule: a label that alone exceeds the row width stays alone on its line and wraps inside its own button, and text that changes height when wrapping does not change the lines. There is no `alignContent`: the lines stay together, separated by the 12.
- The dialog window's shadow (from the system) and the `scrim` behind it are not part of the drawing, and neither are the `onDismissRequest`, the window, the focus and the opening animation.
- Title of more than one line with an icon: Compose centers the title box and leaves the lines left-aligned inside it; the drawing centers each line (`font.align: "center"`).
- The text does not scroll when it exceeds the window height (`weight(1f, fill = false)` with the screen's `verticalScroll`), and the free content of the `title`, `text` and `icon` slots (composables) does not exist: only text and an icon from the set.
- The button row measures 48 and the `size` is 312 × 248 (the dialog of the "Confirmation with icon" example): the `TextButton` takes 48 in the layout, the button's 40 plus the minimum touch target of `minimumInteractiveComponentSize` (`Surface.kt` line 219). The drawn button stays 40 tall, centered in the 48 (the `touch target (<button>)` frame), and the label sits 28 from the bottom edge as in Compose; with the buttons on two lines the row measures 48 + 12 + 48. Examples without an icon or with less text have leftover space at the bottom (accepted effect, as in #863).
- No node of the dialog has an estimated vertical position: the spaces are Compose's 24, 16 and 8 and the label is centered in the button. `cap-middle` centers the capital letter, not the line box that Compose's `Text` centers; with Roboto the difference is below 1 px.

**Accessibility** (stage #1081; the unit is the dp, 1 dp = 1 component unit): the type has `accessibility.role` `dialog`, named by the `title` and the `text`; Compose declares no `Role` for it in `AlertDialog.kt` (the name comes from the WAI-ARIA list). The `icon` is an `image` part with the optional `iconDescription` field, because the icon above the title is decorative by default.
