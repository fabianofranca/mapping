# Visual pass on Details — 2026-11-10 (épico `epic/detalhes-visual`)

## Pendências

- **`Choice` in the List (`DataGrid`):** the **Incomplete only** checkbox now carries the `warning` icon (outline SVG) in the label, in place of the fixed ⚠ glyph. Files: `src/ui/ListView.tsx`, `tests/components/bottomWindows.test.tsx`.
- **Details type dialog (`TypePicker`):** the empty list shows the reason message (`emptyMessage`, keys `typed.empty.*`) in place of the generic notice; the `LinkDialog` does not change. Files: `src/ui/TypePicker.tsx`, `src/ui/AnnotationsPanel.tsx`, `src/ui/offeredTypes.ts`.

## Sincronização

Gravado no artefato **Mapping** on 2026-11-10: version 73 (`1794311275-062c`), in a single publication, with the index last and `lastChange` "Claude Code (épico detalhes-visual, DV1)":

- `components/DataGrid/preview.html`: the **Incomplete only** checkbox now carries the `warning` icon (outline SVG, the same paths as in the code) in place of the ⚠ glyph; the accessible name remains the text "Incomplete only".
- `components/DataGrid/README.md` (item in "States" about the icon and the accessible name) and `components/Choice/README.md` (the `warning` icon as an example of a node label).
- `components/Dialog/README.md`: the type choice of the new annotation describes the empty list with the reason message (`emptyMessage`; the generic notice `typed.noTypes` only with no reason) and the pt-BR texts of the five `typed.empty.*` keys.
- Visual check: the `DataGrid` preview opened in a local Chrome in the light and dark themes, with no horizontal bar at 900 px; the icon inherits the text color.

## Ficou sem gravar

- Preview of the Details type dialog (`TypePicker`) with the empty list. Motivo: the DS has no `TypePicker` component (it is on the list of the 9 components "without a component in the DS" approved by the owner); the text stayed only in the `Dialog` guide.
