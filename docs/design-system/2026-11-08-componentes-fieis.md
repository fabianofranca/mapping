# Faithful components — 2026-11-08 (épico `epic/componentes-fieis`)

## Pendências

- CF1: nenhuma (no interface; the component format and the libraries' drawing are not in the DS).
- CF6: two new controls, both `Select` from `src/ui/controls/`.
  - **Project drawing mode** (`src/ui/SettingsDialog.tsx`): selector in its own section of **Settings**, with the modes declared by the specializations (and "First mode of each specialization" when there is no choice). It lives in Settings, and not on the canvas bar, by decision 17 of the stage: `SettingsBar` holds the person's preferences (language and theme), not project data, and Settings already hold the repositories per platform, which also belong to the project.
  - **Container drawing mode** (`src/ui/DetailsSection.tsx`): field "Drawing mode: Follow the project / <modes>" in the container Details.
- CF8: marking indicators (layer dots and "+N", `src/canvas/renderers/markings.ts`, `renderers/indicatorVisibility.ts`). New canvas token **`size-indicator-min-marking`** = `24px` (3× the 8 px diameter of the dot; decision 25 proposes on the order of 3×), in `src/theme/tokens.ts`, read in `src/canvas/theme.ts`: below it (width or height on screen) the dots and the "+N" disappear in Edit mode on a marking with a component; selected or under the mouse shows everything; ⚠ always. Value proposed for the DS: 24px in both themes.
- CF12: read-only block **Modes, tokens and icons** in the specialization row (`src/ui/SpecTokensInfo.tsx`, inside `src/ui/SpecsDialog.tsx`): `small muted` labels, definition list `.spec-design-tokens` (`src/theme/dialogs.css`), only spacing tokens, no new component.
- CF13: reference field (`ref-control`, `src/theme/details.css`): at narrow width the target's layer (`.ref-control-layer`) shrinks before the name (`flex: 0 100 auto`) and, in Details (`.ref-field` outside `.ref-cell`), the go-to-target and clear buttons wrap to a new line when the control would be under 14ch. No new token or icon; only the component's behavior in the DS.

## Sincronização

Gravado no artefato **Mapping** (version 60, `lastChange` "Claude Code (fechamento do épico componentes-fieis)"), in a single publish, index last:

- `tokens.json`: `size-indicator-min-marking` = `24px` (`size` family).
- `Canvas.md` and `components/CanvasMarking/README.md`: the token and the indicator rule at low zoom (CF8).
- `components/Select/README.md`, `components/SettingsDialog/README.md` and `components/MarkingPanel/README.md`: the "Drawing mode" of the project (Settings) and of the container (Details) (CF6).
- `components/SpecsDialog/README.md`: the "Modes, tokens and icons" block (CF12).
- `components/ReferenceField/README.md`: the reference field at narrow width (CF13).

## Ficou sem gravar

- Passou para o registro do épico `epic/sincronia-ds-2`: `Select` preview with the project and container "Drawing mode" (DS5).
- Passou para o registro do épico `epic/sincronia-ds-2`: `SettingsDialog` preview with the "Drawing mode" section (DS4), and the guide fix (without a saved mode the first declared one applies) (DS3).
- Passou para o registro do épico `epic/sincronia-ds-2`: `SpecsDialog` preview with the "Modes, tokens and icons" block (DS5) and the `.spec-design*` classes in `bundle.css` (DS3).
- Passou para o registro do épico `epic/sincronia-ds-2`: `ReferenceField` preview with the field at narrow width (DS5).
- Passou para o registro do épico `epic/sincronia-ds-2`: `CanvasMarking` preview with the dot hidden by size: no effect, the dots and the `size-indicator-min-marking` token left the code.
