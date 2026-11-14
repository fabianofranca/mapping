# Divider

A thin line that separates content. Horizontal separates the items of a list or the sections of a column; vertical separates items side by side in a row.

Annotation type: `divider` (Components layer).

## Fields

| Key           | Label            | Type   | Required | Options                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | Default      | Description                                                                                                                                                 |
| ------------- | ---------------- | ------ | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `orientation` | Orientation      | enum   | no       | `horizontal`, `vertical`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | `horizontal` | horizontal (HorizontalDivider) or vertical (VerticalDivider).                                                                                               |
| `thickness`   | Thickness (dp)   | number | no       |                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |              | Line thickness in dp. Empty = 1 (the Compose default). The drawing approximates values from 1 to 4.                                                         |
| `color`       | Color            | enum   | no       | `primary`, `onPrimary`, `primaryContainer`, `onPrimaryContainer`, `secondary`, `onSecondary`, `secondaryContainer`, `onSecondaryContainer`, `tertiary`, `onTertiary`, `tertiaryContainer`, `onTertiaryContainer`, `error`, `onError`, `errorContainer`, `onErrorContainer`, `background`, `onBackground`, `surface`, `onSurface`, `surfaceVariant`, `onSurfaceVariant`, `surfaceTint`, `inverseSurface`, `inverseOnSurface`, `inversePrimary`, `outline`, `outlineVariant`, `scrim`, `surfaceBright`, `surfaceDim`, `surfaceContainerLowest`, `surfaceContainerLow`, `surfaceContainer`, `surfaceContainerHigh`, `surfaceContainerHighest` |              | Theme color role used for the line (color parameter). Empty = outline variant (DividerDefaults.color).                                                      |
| `inset`       | Inset (dp)       | number | no       |                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |              | Inset at both ends of the line, in dp. Empty = edge to edge (no inset).                                                                                     |
| `insetStart`  | Start inset (dp) | number | no       |                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |              | Inset of the start end of the line (left when horizontal, top when vertical), in dp. Empty with insetEnd also empty = the inset applies to both ends.       |
| `insetEnd`    | End inset (dp)   | number | no       |                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |              | Inset of the final end of the line (right when horizontal, bottom when vertical), in dp. Empty with insetStart also empty = the inset applies to both ends. |

## Compose

- Symbol: `androidx.compose.material3.HorizontalDivider`
- File (`path`): `compose/material3/material3/src/commonMain/kotlin/androidx/compose/material3/Divider.kt`
- The `orientation` field chooses the symbol; values without their own case use the base one.

| `orientation`       | Symbol              |
| ------------------- | ------------------- |
| `horizontal` (base) | `HorizontalDivider` |
| `vertical`          | `VerticalDivider`   |

How the annotation becomes the call (the values below are examples; the parameter names and expressions are those of `params` and `values` in `code`):

```kotlin
HorizontalDivider(    // orientation vertical: VerticalDivider (same parameters)
    thickness = 1.dp,    // no thickness in the annotation: omit it (1 dp)
)

// with inset 16: inset at both ends
HorizontalDivider(modifier = Modifier.padding(horizontal = 16.dp))

// VerticalDivider between two items of a Row
Row(Modifier.height(48.dp)) {
    Text("Today")
    VerticalDivider()
    Text("Yesterday")
}
```

Notes from `code` (what the tool hands to the agent):

> Stable, no opt-in. `thickness` is a `Dp`: write `thickness = <thickness>.dp` (without the field, the default of 1 dp stays). The `HorizontalDivider` already fills the parent's whole width (`fillMaxWidth()` inside); for an inset at the ends use `Modifier.padding(horizontal = <inset>.dp)`. The default color is `DividerDefaults.color` (outline variant); with the `color` field filled, pass `color = <color>`. For different insets at the ends use `Modifier.padding(start = <insetStart>.dp, end = <insetEnd>.dp)`. In a `Column` or `LazyColumn` it goes between items; inside a `ListItem` use the position between one item and the next.

`vertical` variant: Stable, no opt-in. `thickness = <thickness>.dp` (without the field, 1 dp). The `VerticalDivider` already fills the parent's whole height (`fillMaxHeight()` inside); inside a `Row`, give the line its height with `Modifier.height(<marking height>.dp)` or let the `Row` constrain it. With `color` filled, pass `color = <color>`. For an inset at the top and bottom use `Modifier.padding(vertical = <inset>.dp)`, or `Modifier.padding(top = <insetStart>.dp, bottom = <insetEnd>.dp)` with per-end insets.

## Examples

- **Horizontal**: orientation=horizontal
- **Horizontal with inset**: orientation=horizontal, thickness=1, inset=16
- **Vertical**: orientation=vertical, thickness=1
- **Inset per end**: orientation=horizontal, insetStart=16, insetEnd=48

## Fidelity

Reference: Compose `material3` 1.4.0, commit `5113b82a4ed6416d6344efa50e41db8cb65928ff` (decisions 1 to 3 of the faithful Material 3 stage). 1 dp = 1 component unit; the container density converts it to image pixels (`docs/COMPONENT-FORMAT.md`, "Units and density"). The values come from the specialization tokens (`tokens`, in the `light` and `dark` modes), which mirror the androidx token files; no color, font or radius is literal in the component.

**Files used**

- `compose/material3/material3/src/commonMain/kotlin/androidx/compose/material3/Divider.kt` (lines 49 to 61: `HorizontalDivider(thickness, color)` with `fillMaxWidth()`; lines 111 to 118: `DividerDefaults.Thickness` and `DividerDefaults.color`).
- `compose/material3/material3/src/commonMain/kotlin/androidx/compose/material3/tokens/DividerTokens.kt` (lines 24 and 25: `Color` = `OutlineVariant`, `Thickness` = 1 dp).
- `ColorLightTokens.kt` and `ColorDarkTokens.kt`: the `outline-variant` role.

**How the drawing follows Compose**

- The line is a `rect` in the role of the `color` field (`outline-variant` when empty, the `DividerDefaults.color`), with the thickness of the `thickness` field (any value, 1 dp when empty) read by an expression in the node size: the `rect` for each thickness (1 to 4) is gone.
- Horizontal: the line takes the width of the box; vertical: the height, like Compose's `fillMaxWidth()` and `fillMaxHeight()`. `insetStart` and `insetEnd` inset each end (left and right when horizontal; top and bottom when vertical); `inset` insets both when both are empty (a filled value, even 0, applies in place of `inset`).
- The line is centered in the marking box.

**What still differs from Compose**

- Compose applies the inset with `Modifier.padding`, outside the `Divider`; in the drawing it is a field of the type (`inset`, `insetStart` and `insetEnd`).
