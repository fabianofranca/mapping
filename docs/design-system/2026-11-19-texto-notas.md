# Text type in the notes library — 2026-11-19 (épico `epic/texto-notas`)

## Pendências

- `SpecsDialog` (`src/ui/SpecsDialog.tsx`): a new **Update to the built-in version (v{version})** button on the specialization row, next to **Update…**. It is the ordinary `Button` from `src/ui/controls/`, with no new style, token or icon; it only shows when the library has a newer built-in version, and it is disabled in read-only. The component spec of the Mapping artifact still needs the row's button list updated.

## Sincronização

Nothing was written to the **Mapping** artifact: the write of the `SpecsDialog` guide and preview was refused by the session's permission classifier, so the pending item above stays in `## Ficou sem gravar`. The artifact index was read right before (`lastChange` of 2026-11-18, epic `paginas`) and was not changed.

## Ficou sem gravar

- `SpecsDialog` row: the **Update to the built-in version (v{version})** button (`spec.updateBundled`), between **Update version…** and **Update from zip…**; shown only when the app bundles a newer copy of the library. To write: `components/SpecsDialog/README.md` (the sentence on the list item's buttons in "Medidas e tokens") and a button in the item row of the "Depois de aplicar um arquivo…" card of `components/SpecsDialog/preview.html`. **Motivo:** the `Artifact` publish to the DS artifact was denied by the Claude Code auto-mode permission classifier ("Unsanctioned Communication"), and the session did not try another way around it.
