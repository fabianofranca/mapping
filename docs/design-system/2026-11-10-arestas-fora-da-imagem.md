# Content edges outside the image — 2026-11-10 (épico `epic/arestas-fora-da-imagem`)

## Pendências

- `.ref-control` (Details, `src/ui/TypedFields.tsx`, `src/ui/RefCell.tsx`): the control now comes inside the `Tooltip` (in place of the native `title`), with the target, the layer and the shortcut hint in full; the `Tooltip` anchor takes the width of the field. The target label already has priority over the layer name (`.ref-control-layer` yields first). No new token; nothing changes at 1280×720.
- `ref` cell of the table (`.ref-cell`, CL1): with no minimum width of its own, the ✕ drops to the next line when the column is narrow and the icon disappears in the table (CL2 removed the token `size-grid-ref-col-min`, which made the table scroll horizontally at 1280 and 900 px): the column shares the table like the others. The ✕ no longer stretches (only the control's anchor), the control shrinks inside the cell and the broken reference wraps between words, with no clipping. `.ref-control-layer` now shrinks with factor `1000000`. In the light and dark themes they only use color tokens that already exist.
- Epic review: in the `ref` field of Details only the control's anchor stretches (`.ref-field > .tooltip-anchor:first-child`); those of the ↗ and ✕ buttons keep the button size (before the adjustment, the `Tooltip` stretched each one to a full line). No new token.

## Sincronização

Not written: the Artifact tool was denied by the permission classifier at this close (see below). No version of the artifact changed; the index was not touched.

## Ficou sem gravar

- Passou para o registro do épico `epic/sincronia-ds-2`: `ReferenceField` guide (the `Tooltip` in place of the `title`, the layer that yields first, the broken button that wraps) and `bundle.css` (text, DS3; changed: the record's swap becomes today's text, in the plan).
- Passou para o registro do épico `epic/sincronia-ds-2`: `RefCell` guide (`Tooltip`, column with no minimum width, ✕ that drops, text that wraps) (text, DS3; changed: the reason for the pending item now goes in the `Tooltip`).
- Passou para o registro do épico `epic/sincronia-ds-2`: `lastChange` of the `design-system.json` index: not a pending item (the index is written by whoever writes, last, see "When to update" in `docs/DESIGN-SYSTEM.md`).
- Passou para o registro do épico `epic/sincronia-ds-2`: `ReferenceField` and `RefCell` previews still imitate the native `title` of the `ref-control` button: swap for the `Tooltip` (preview, DS5).
