# Text type in the notes library — 2026-11-19 (épico `epic/texto-notas`)

## Pendências

- `SpecsDialog` (`src/ui/SpecsDialog.tsx`): a new **Update to the built-in version (v{version})** button on the specialization row, next to **Update…**. It is the ordinary `Button` from `src/ui/controls/`, with no new style, token or icon; it only shows when the library has a newer built-in version, and it is disabled in read-only. The component spec of the Mapping artifact still needs the row's button list updated.

## Sincronização

Gravado no artefato **Mapping** on 2026-11-19: version 95. `components/SpecsDialog/README.md` (the list item's buttons now include **Update to the built-in version (vN)**, shown when the app bundles a newer copy) and `components/SpecsDialog/preview.html` (the button in the item row of the "after applying a file" card). The index was read right before and only its `lastChange` changed.

## Ficou sem gravar

None.
