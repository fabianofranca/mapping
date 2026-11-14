# List item

List item of one to three lines, with content on the left and on the right. Use it inside lists.

Annotation type: `list-item` (Components layer).

## Fields

| Key                 | Label           | Type   | Required | Options                                                   | Default | Description                                                                                                                                                                                                                                                   |
| ------------------- | --------------- | ------ | -------- | --------------------------------------------------------- | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `headlineContent`   | Headline        | string | yes      |                                                           |         | Main line of the item.                                                                                                                                                                                                                                        |
| `overlineContent`   | Overline        | string | no       |                                                           |         | Small line above the headline. Empty = no line.                                                                                                                                                                                                               |
| `supportingContent` | Supporting text | string | no       |                                                           |         | Supporting line below the headline. Empty = no line.                                                                                                                                                                                                          |
| `leadingIcon`       | Leading icon    | string | no       | free text; icon suggestions (`Home`, `Search`, `Person`…) |         | Icon on the left. Empty = no icon.                                                                                                                                                                                                                            |
| `leadingImage`      | Avatar (URL)    | string | no       |                                                           |         | https:// address of the avatar on the left. Empty = no avatar.                                                                                                                                                                                                |
| `trailingContent`   | Trailing text   | string | no       |                                                           |         | Short text on the right (time, amount). Empty = no text.                                                                                                                                                                                                      |
| `trailingIcon`      | Trailing icon   | string | no       | free text; icon suggestions (`Home`, `Search`, `Person`…) |         | Icon on the right. Empty = no icon.                                                                                                                                                                                                                           |
| `interaction`       | Interaction     | enum   | no       | `none`, `hovered`, `focused`, `pressed`, `dragged`        | `none`  | Resting look of the interaction state: hovered, focused, pressed or dragged (with the level 4 shadow); none = no state layer. It only changes the drawing, it does not go into the code. The item has no disabled state (no enabled): the state always draws. |

## Compose

- Symbol: `androidx.compose.material3.ListItem`
- File (`path`): `compose/material3/material3/src/commonMain/kotlin/androidx/compose/material3/ListItem.kt`

How the annotation becomes the call (the values below are examples; the parameter names and the expressions are those of `params` and `values` in `code`):

```kotlin
ListItem(
    overlineContent = { Text("Today") },
    headlineContent = { Text("Planning meeting") },
    supportingContent = { Text("Room 3, with the product team.") },
    leadingContent = { Icon(Icons.Filled.DateRange, contentDescription = null) },
    trailingContent = { Icon(Icons.AutoMirrored.Filled.KeyboardArrowRight, contentDescription = null) },
)
```

Notes from `code` (what the tool hands to the agent):

> `headlineContent = { Text(<headlineContent>) }`; a filled `overlineContent`, `supportingContent` or `trailingContent` becomes `{ Text(<field>) }` (the item has one to three lines depending on what is filled). `leadingIcon` and `trailingIcon` become `leadingContent`/`trailingContent` with `Icon(Icons.Filled.<name>, contentDescription = null)`; `leadingImage` is an avatar with `Modifier.size(40.dp).clip(CircleShape)` that, when remote, uses the app's image loader (for example Coil `AsyncImage`).

## Examples

- **One line**: headlineContent=Wi-Fi, leadingIcon=Settings
- **Two lines**: headlineContent=Ana Souza, supportingContent=Shall we get lunch?, trailingContent=12:30, leadingImage=https://example.com/ana.jpg
- **Three lines**: overlineContent=Today, headlineContent=Planning meeting, supportingContent=Room 3, with the product team., trailingIcon=KeyboardArrowRight
- **Two-line supporting text**: headlineContent=Planning meeting, supportingContent=Room 3, with the product team, to agree on the semester planning., leadingIcon=DateRange, trailingContent=12:30
- **Hovered**: headlineContent=Ana Souza, supportingContent=Shall we get lunch?, leadingIcon=Person, interaction=hovered
- **Focused**: headlineContent=Ana Souza, overlineContent=Today, supportingContent=Shall we get lunch?, trailingContent=12:30, interaction=focused
- **Pressed**: headlineContent=Ana Souza, supportingContent=Shall we get lunch?, leadingIcon=Person, interaction=pressed
- **Dragged**: headlineContent=Ana Souza, supportingContent=Shall we get lunch?, leadingIcon=Person, interaction=dragged

## Fidelity

Reference: Compose `material3` 1.4.0, commit `5113b82a4ed6416d6344efa50e41db8cb65928ff` (decisions 1 to 3 of the faithful Material 3 stage). 1 dp = 1 component unit; the container's density converts it to image pixels (`docs/COMPONENT-FORMAT.md`, "Units and density"). The values come from the specialization's tokens (`tokens`, in the `light` and `dark` modes), which mirror the androidx tokens files; no color, font or opacity is left literal in the component.

**Files used**

- `compose/material3/material3/src/commonMain/kotlin/androidx/compose/material3/ListItem.kt` (lines 95 to 186: `ListItem`, the `Surface` with `ListItemDefaults.shape` and `containerColor`, the style of each text by token and the `Box`es with `LeadingContentEndPadding` and `TrailingContentStartPadding`; 191 to 330: `ListItemMeasurePolicy`, the `ListItemStartPadding`/`ListItemEndPadding` breathing room and the item type; 451 to 473: `calculateHeight`, the minimum height by type; 475 to 524: `place`, the content centered (one and two lines) or at the top with `topPadding` (three lines); 527 to 610: `ListItemDefaults` and `defaultListItemColors`; 712 to 741: `ListItemType`, three lines with overline and supporting text together or with multiline supporting text; 743 to 757: `ListItemVerticalPadding` 8, `ListItemThreeLineVerticalPadding` 12, `ListItemStartPadding` and `ListItemEndPadding` 16, `LeadingContentEndPadding` and `TrailingContentStartPadding` 16; 764 to 768: `verticalPadding`).
- `compose/material3/material3/src/commonMain/kotlin/androidx/compose/material3/tokens/ListTokens.kt` (lines 27: `ListItemContainerColor` `Surface`; 29: `ListItemContainerShape` `CornerNone`; 46 and 47: headline in `OnSurface` and `BodyLarge`; 49 to 53: avatar of 40, `PrimaryContainer`, `CornerFull`; 54 and 55: leading icon of 24 in `OnSurfaceVariant`; 62, 78 and 72: heights 56, 72 and 88; 63 and 64: overline `OnSurfaceVariant` and `LabelSmall`; 70 and 71: supporting text `OnSurfaceVariant` and `BodyMedium`; 73 and 74: trailing icon of 24 in `OnSurfaceVariant`; 76 and 77: trailing text `OnSurfaceVariant` and `LabelSmall`).
- `compose/material3/material3/src/commonMain/kotlin/androidx/compose/material3/tokens/TypographyTokens.kt` (`BodyLarge` 16/24/400/0.5, `BodyMedium` 14/20/400/0.2 and `LabelSmall` 11/16/500/0.5).
- `compose/material3/material3/src/commonMain/kotlin/androidx/compose/material3/tokens/ListTokens.kt` (lines 36 to 45 and 65 to 67: `ListItemDraggedContainerElevation` and the `Hover*`, `Focus*`, `Pressed*` and `Dragged*` roles of the label and the icons; line 26: `FocusIndicatorColor`) and `compose/material3/material3/src/commonMain/kotlin/androidx/compose/material3/tokens/ElevationTokens.kt` (`Level4`, 8 dp, the library's level 4).
- `compose/material3/material3/src/commonMain/kotlin/androidx/compose/material3/tokens/StateTokens.kt` (lines 22 to 25: `HoverStateLayerOpacity`, `FocusStateLayerOpacity`, `PressedStateLayerOpacity`; `DraggedStateLayerOpacity` 0.16 is the `state-dragged`).

**How the drawing follows Compose**

- `surface` container with no corner (`CornerNone`), with 16 of breathing room on both sides and 16 between the leading content, the text and the trailing content (`LeadingContentEndPadding` and `TrailingContentStartPadding`). The vertical breathing room is 8 and becomes 12 in the three-line item (overline and supporting text present, or two-line supporting text).
- Item type (`ListItemType`, `ListItem.kt` lines 712 to 741): three lines when there are an overline and supporting text **or** when the supporting text takes two lines (`isSupportingMultiline`, lines 273 to 275 and 733); two lines with only the overline or only one-line supporting text; one line with only the headline. The drawing decides by the **measured** lines of the supporting text (`{ "$lines": "supporting" }`), at the width the text actually has, and not by Compose's height estimate.
- Minimum height by type (`calculateHeight`, lines 451 to 473): 56 with only the headline, 72 with an overline or one-line supporting text and 88 in the three-line item (overline with supporting text, or two-line supporting text). It is the `minHeight` of the `body` frame, computed from the fields and the supporting text lines, and the `sizing` stays `hug` in height: with no rectangle, and in the fitted size (Arrange and `fit_marking`), the item measures the content plus the breathing room and is never below the minimum. With a rectangle, the content is arranged in its height.
- One and two lines: leading content, text block and trailing content centered in the height (`CenterVertically.align`, lines 492 and 520). Three lines, including two-line supporting text without an overline: everything pinned to the top, at 12 (`ListItemThreeLineVerticalPadding`, line 745, in the `topPadding` of `place`, lines 498 to 500), including the leading icon, the avatar and the trailing content. The text block carries no `paddingFromBaseline`: `ListItem` stacks overline, headline and supporting text by the heights of the line boxes, so no node uses `baselinePadding` (the two lines of the 14/20 supporting text add up to 40 and the block measures 24 + 40 = 64 inside the 88).
- Headline in `body-large` (16/24, `on-surface`), overline in `label-small` (11/16, `on-surface-variant`) above it and supporting text in `body-medium` (14/20, `on-surface-variant`) below, all by tokens and without `family`. Trailing text in `label-small` (`ListItemTrailingSupportingTextFont`) in `on-surface-variant`.
- Leading and trailing icons through the library set's `icon` node, 24 in `on-surface-variant`. Avatar of 40 (`ListItemLeadingAvatarSize`) in `corner-full`, with the `primary-container` fill (`ListItemLeadingAvatarColor`) while the image does not load.
- Text clipped like the `Text` of the Material examples: headline and overline on one line with `…`, supporting text on one line with `…` when there is an overline and on up to two without it (`font.maxLines` and `font.ellipsis`), which keeps the item within 88.
- Headline and trailing content (one line) are centered by the cap height (`font.verticalAlign: "cap-middle"`); the overline and the supporting text stay as they are. Compose's `Text` centers by the font's line box; with Roboto the two coincide to within 1 px.

**Interaction state (the `interaction` field)**

The field chooses the resting look of a state; it does not go into the `code` or the `variants`. The options are `none`, `hovered`, `focused`, `pressed` and `dragged`: `ListTokens.kt` defines the four (`ListItemHover*`, `ListItemFocus*`, `ListItemPressed*` and `ListItemDragged*`). **This type has no `enabled`**, so there is no disabled state that wins: the state always draws.

- **State layer:** the `state` node is a `rect` the size of the item, on top of the content, in the label color of the four states, `on-surface` (`ListItemHoverLabelTextColor`, `ListItemFocusLabelTextColor`, `ListItemPressedLabelTextColor` and `ListItemDraggedLabelTextColor`, lines 43, 40, 65 and 37), with `opacity` by the tokens `state-hover` (0.08), `state-focus` (0.10), `state-pressed` (0.10) and `state-dragged` (0.16). `ListTokens.kt` **does not name** a state layer color or opacity (and `ListItem` is not clickable by itself): it is the `card` convention, the content color.
- **Dragged:** the elevation goes from level 0 (`ListItemContainerElevation`) to level 4 (`ListItemDraggedContainerElevation`, line 36): the root gains the two level 4 shadows (point: `y` 2, `blur` 3; ambient: `y` 6, `blur` 10, `spread` 4; tokens `elevation-4-point-*` and `elevation-4-ambient-*`). The elevation tint (`surface-tint`) is not drawn.
- **Content colors:** the label (`on-surface`) and the icons (`on-surface-variant`) repeat the usual roles in all states (`ListItem*LeadingIconColor`, `ListItem*TrailingIconColor`).
- **Structure:** the root became `layout` `none` and the content (the row of avatar, icon, texts and trailing content) went into the `body` frame; the size stays `hug` in height.

**What still differs from Compose**

- `ListItem` does not clip any text: the `Text` that the screen passes decides the lines. The drawing adopts the clip above (`maxLines` 1, 1 and 1 or 2), which is the Material convention, and not a rule of the composable.
- The supporting text goes to two lines through the drawing's clip (`maxLines` 2 without an overline, 1 with it), and not through the composable's rule: Compose counts the lines that the app's `Text` has, with no ceiling. Supporting text that Compose would break into three lines or more (height above 88) stays at two, with `…`, and the item measures 88.
- Only icon, remote avatar and text as leading and trailing content; Compose's `leadingContent` and `trailingContent` are free (checkbox, switch, 56 image, 100 by 56 video). `containerColor`, `headlineColor`, `leadingIconColor`, `overlineColor`, `supportingColor`, `trailingIconColor`, `disabledHeadlineColor`, `disabledLeadingIconColor`, `disabledTrailingIconColor`, `tonalElevation` and `shadowElevation` are fields and code, but the drawing does not use them. The disabled state at 0.38, the selected one, the dragged one, the pressed one, the focus and the hover do not exist: the drawing is the normal state.
- The divider between items (`ListTokens.DividerLeadingSpace` and `DividerTrailingSpace` of 16) belongs to a separate `HorizontalDivider`, and not to `ListItem`, so the type does not draw it.
