# Segmented button

Row of two to five segments to choose one option (single selection) or several (multiple selection). Each row of Options is a segment.

Annotation type: `segmented-button` (layer Components).

## Fields

| Key           | Label       | Type  | Required | Options                                 | Default  | Description                                                                                                                                                                                                                                                                                               |
| ------------- | ----------- | ----- | -------- | --------------------------------------- | -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `options`     | Options     | table | yes      | see Columns below                       |          | One segment per row, in the order they appear (two to five).                                                                                                                                                                                                                                              |
| `selection`   | Selection   | enum  | no       | `single`, `multi`                       | `single` | single (SingleChoiceSegmentedButtonRow) marks one segment; multi (MultiChoiceSegmentedButtonRow) accepts several.                                                                                                                                                                                         |
| `enabled`     | Enabled     | enum  | no       | `true`, `false`                         | `true`   | false disables the segments.                                                                                                                                                                                                                                                                              |
| `interaction` | Interaction | enum  | no       | `none`, `hovered`, `focused`, `pressed` | `none`   | Resting appearance of the interaction state: hovered, focused or pressed; none = no state layer. It only changes the drawing and does not go into the code. It applies to the selected segment (each selected one, in multiple selection). With enabled false nothing is drawn (the disabled state wins). |

Columns of `options` (one row per option):

| Key               | Label            | Type   | Required | Options                                                   | Default |
| ----------------- | ---------------- | ------ | -------- | --------------------------------------------------------- | ------- |
| `label`           | Label            | string | yes      |                                                           |         |
| `icon`            | Icon             | string | no       | free text; icon suggestions (`Home`, `Search`, `Person`…) |         |
| `iconDescription` | Icon description | string | no       | free text                                                 |         |
| `selected`        | Selected         | enum   | no       | `true`, `false`                                           | `false` |

## Compose

- Symbol: `androidx.compose.material3.SingleChoiceSegmentedButtonRow`
- File (`path`): `compose/material3/material3/src/commonMain/kotlin/androidx/compose/material3/SegmentedButton.kt`
- The `selection` field chooses the symbol; values without their own case use the base one.

| `selection`     | Symbol                           |
| --------------- | -------------------------------- |
| `single` (base) | `SingleChoiceSegmentedButtonRow` |
| `multi`         | `MultiChoiceSegmentedButtonRow`  |

How the annotation becomes the call (the values below are examples; the parameter names and expressions are those of `params` and `values` in `code`):

```kotlin
SingleChoiceSegmentedButtonRow {    // selection multi: MultiChoiceSegmentedButtonRow
    // a row of options becomes a SegmentedButton
    SegmentedButton(
        selected = false,
        onClick = { /* screen logic */ },
        shape = SegmentedButtonDefaults.itemShape(index = 0, count = 3),
        enabled = true,
        icon = { SegmentedButtonDefaults.Icon(active = false) },
        label = { Text("Day") },
    )
    SegmentedButton(
        selected = true,
        onClick = { /* ... */ },
        shape = SegmentedButtonDefaults.itemShape(index = 1, count = 3),
        enabled = true,
        icon = { SegmentedButtonDefaults.Icon(active = true) },
        label = { Text("Week") },
    )
    // ... the third segment (index = 2, count = 3)
}
```

`code` notes (what the tool hands to the agent):

> One `SegmentedButton` per row of `options`, inside `SingleChoiceSegmentedButtonRow { … }`: `selected`, `onClick`, `shape = SegmentedButtonDefaults.itemShape(index = <row position>, count = <number of rows>)` (required), `enabled = <enabled>` (a segment parameter, not a row one), `icon = { SegmentedButtonDefaults.Icon(active = <selected>) }` (the check) and `label = { Text(<label>) }`. With the `icon` column filled, pass `inactiveContent = { Icon(Icons.Filled.<icon>, contentDescription = null, Modifier.size(SegmentedButtonDefaults.IconSize)) }` to `SegmentedButtonDefaults.Icon`. The `SegmentedButton` is an extension function of the row scope: import `androidx.compose.material3.SegmentedButton`. No type requires opt-in. 1.4.0 does not ship the icons: the app adds `androidx.compose.material:material-icons-core` (or `-extended`) or uses a Material Symbol with `painterResource`.

`multi` variant: One `SegmentedButton` per row of `options`, inside `MultiChoiceSegmentedButtonRow { … }`, with `checked = <selected>` and `onCheckedChange` in place of `selected` and `onClick` (each segment toggles on its own); `shape = SegmentedButtonDefaults.itemShape(index = <row position>, count = <number of rows>)`, `enabled = <enabled>`, `icon = { SegmentedButtonDefaults.Icon(active = <selected>) }` and `label = { Text(<label>) }`. Import `androidx.compose.material3.SegmentedButton`.

## Examples

- **Single selection**: selection=single
- **Multiple selection**: selection=multi
- **Disabled**: selection=single, enabled=false
- **Hovered**: selection=single, interaction=hovered
- **Focused**: selection=multi, interaction=focused
- **Pressed**: selection=single, interaction=pressed

## Fidelity

Reference: Compose `material3` 1.4.0, commit `5113b82a4ed6416d6344efa50e41db8cb65928ff` (decisions 1 to 3 of the faithful Material 3 stage). 1 dp = 1 component unit; the container density converts it to image pixels (`docs/COMPONENT-FORMAT.md`, "Units and density"). The values come from the specialization tokens (`tokens`, in the `light` and `dark` modes), which mirror the androidx token files; no color, font or radius is literal in the component.

**Files used**

- `compose/material3/material3/src/commonMain/kotlin/androidx/compose/material3/SegmentedButton.kt` (lines 130 to 170 and 210 to 250: the `SegmentedButton` with `weight(1f)`, `defaultMinSize` of `ButtonDefaults.MinWidth` and `MinHeight` and the `Surface` with the `border`; 328 to 347 and 364 to 381: the rows, with `Arrangement.spacedBy(-space)` that overlaps the segments by 1 (the border) and a minimum height of `ContainerHeight`; 383 to 462: `SegmentedButtonContent`, with the 18 icon, `IconSpacing` 8 and the centered group; 541 to 567: the default colors (selected `SelectedContainerColor`, border `OutlineColor`, disabled with `DisabledLabelTextOpacity` and `DisabledOutlineOpacity`); 582 to 611: `BorderWidth`, `itemShape` (full shape only at the ends), `IconSize` and `ContentPadding`; 614 to 622: the `ActiveIcon` is the `Icons.Filled.Check`; 841: `IconSpacing`).
- `compose/material3/material3/src/commonMain/kotlin/androidx/compose/material3/tokens/OutlinedSegmentedButtonTokens.kt` (lines 25 to 54: `ContainerHeight` 40, `OutlineWidth` 1, `Shape` `CornerFull`, `LabelTextFont` `LabelLarge`, `IconSize` 18, and the selected and unselected roles).
- `compose/material3/material3/src/commonMain/kotlin/androidx/compose/material3/Button.kt` (lines 479 to 543: `TextButtonContentPadding` 12 and 8, `MinWidth` 58 and `MinHeight` 40).

**How the drawing follows Compose**

- Row 40 high in the `corner-full` shape; the segments are the `repeat` of `options` in an **equal-column grid** (`repeat.layout` `grid` with `columns: { "$rows": "options" }`, format 4), each with a minimum of 58. At the content-fitted size (`fit_marking`, Arrange and the new instance), the width is `n` times the widest segment, the Compose `IntrinsicSize.Min` with `weight(1f)` (`SegmentedButton.kt` lines 233 to 238 and 328 to 340): with the labels "A" and "Advanced settings" both segments measure the same, that of the widest one.
- Selected: `secondary-container` background, label and check `on-secondary-container`. Unselected: no background, label and icon `on-surface`. The check is the 18 `icon` node and replaces the icon of the column; the label uses the `label-large` tokens (14, 20, 500 and 0.1).
- The icon (18) and the label are 8 apart and the group is centered in the segment, with the `TextButtonContentPadding` space (12 on the sides, 8 above and below). With no icon and unselected, just the label, centered.
- 1 outline in `outline`, inside the box and with the full shape; the root `clip` rounds the ends of the selected background. Between the segments there is a 1 divider in `outline` (the Compose double border, overlapped by 1).
- Disabled: outline and dividers `outline` at `state-disabled-container` (0.12, like `disabledActiveBorderColor` and `disabledInactiveBorderColor`: the code uses `OutlineColor`, not the `on-surface` the token cites), label and icon `on-surface` at `state-disabled-content` (0.38) and the selected background stays `secondary-container` (`disabledActiveContainerColor`).
- Single-line label centered by the cap height (`cap-middle`): the `label` node uses `font.verticalAlign: "cap-middle"` and takes the box height (`height: "fill"`), without changing the horizontal position. The Compose `Text` centers by the font line box (ascent and descent); the drawing centers the cap height in the box, and with Roboto the two coincide to within 1 px.

**Interaction state (`interaction` field)**

The field chooses the resting appearance of a state, as `enabled` chooses the disabled state; it does not go into the `code` or the `variants`. The options are `none` and the states that the commit's `OutlinedSegmentedButtonTokens.kt` defines: `hovered`, `focused` and `pressed` (there is no `Dragged*` in the segmented button tokens, so there is no `dragged`).

- **State layer:** the `state` node is a `rect` the size of the segment, between the background and the content, with the content color of the selected segment, `on-secondary-container` (`SelectedHoverLabelTextColor`, `SelectedFocusLabelTextColor`, `SelectedPressedLabelTextColor` and the `Selected*IconColor`, lines 36 to 42 of `compose/material3/material3/src/commonMain/kotlin/androidx/compose/material3/tokens/OutlinedSegmentedButtonTokens.kt`) and `opacity` from the `state-hover` (0.08), `state-focus` (0.10) and `state-pressed` (0.10) tokens, which mirror `compose/material3/material3/src/commonMain/kotlin/androidx/compose/material3/tokens/StateTokens.kt` (lines 22 to 25). The ends of the row stay rounded because the root clips.
- **Which segment:** the layer lands on the **selected** segment; in multiple selection, on each selected one. There is no index field to pick another. With no segment selected the state draws nothing: the component format has no row index or query over the set of rows, so "the first one, if none is selected" cannot be expressed.
- **Content color:** the label and the icon of the segment keep their resting color in every state (the tokens repeat `on-secondary-container` when selected and `on-surface` when unselected). Elevation and outline do not change with the state in the segmented button tokens.
- **Disabled wins:** with `enabled` `false` the `state` node is invisible, so the drawing is the disabled one, whatever the `interaction`.

**What still differs from Compose**

- The segments touch and the divider is the left side of each one (the first one's is outside the box), instead of overlapping by 1: the width of each segment is `(width + 1) / n`, not `(width + n - 1) / n`, so the boundary lands within 1 of Compose.
- The row width fits the content (`hug`), like the Compose `width(IntrinsicSize.Min)`; with the marking wider than that, the grid splits the marking width equally among the segments (the row with `Modifier.fillMaxWidth()`). The measure is that of the drawing (text, icon and the 12 side padding), not the `minIntrinsicWidth` of the `SegmentedButton`.
- The label deliberately does not wrap (`wrap: none`) and carries `maxLines: 1` with `ellipsis`: in a segment narrower than "check + label" (the marking against the container edge, where `fit_marking` only gets the leftover width), it shrinks inside the track and the `…` cuts the rest, without crossing into the neighbor and without the `content larger than the box` warning. The content-fitted width does not change (the measure ignores the `ellipsis`). Compose only limits through the `Row`.
- The interaction states are still frames: no animated ripple, no transition and no movement of the check swap and the label shift (`SegmentedButtonContentMeasurePolicy` animates the `offsetX`). Compose defines no focus ring for this type at the pinned commit (none of its `*Tokens.kt` carries `FocusIndicatorColor`): none is drawn. The state applies only to the selected segment (see "Which segment").
- The `selection` does not change the drawing (single and multi use the same check); it only changes the code symbol.
