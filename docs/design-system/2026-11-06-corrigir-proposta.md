# Correction in the same proposal — 2026-11-06 (épico `epic/corrigir-proposta`)

## Pendências

- **CP1 and CP2** (model and MCP): none.
- **CP3** (the review in the app):
  - **"Revised" / "New in the revision" badge** (`src/ui/review/RevisedFlag.tsx`): `Flag` with `new` tone and `Tooltip`, on the change, item and image row; the row's accessible name gets the suffix.
  - **"Before the revision" block** in the change Details (`RevisedBefore.tsx`, class `.revised-before` in `src/theme/review.css`, tokens only): `DiffValue` of what the agent had proposed and the earlier decision.
  - **"Revised · N to check" row** of the Proposals window (`ProposalRow.tsx`).
  - **New-revision notice** (`ProposalNotices.tsx`, `RevisedNotice`): text with counts and the **Review** button, absent with its review open.
  - **"Revised only (N)" filter** in the Filters menu (`Choice`), the "Revised by the agent on …" row in the header (`ReviewHeader`) and "From the withdrawn change: …" in the notes (`NoteField`).
  - No new token, icon or control.

## Sincronização

Gravado no artefato **Mapping** on 2026-11-06, when closing the epic (version 48, `1794004854-9fe3`; the index last, with `lastChange`). CP1 and CP2 with no impact. From CP3, only guides and `Revisao.md`:

- `Flag` (guide): the `Revised` / `New in the revision` badge, `new` tone, with `Tooltip`, on the change, item and image row; the row's accessible name gets the suffix.
- `ChangePopover` (guide): the **Before the revision** block (`RevisedBefore.tsx`, `.revised-before`), with the `DiffValue` of what the agent had proposed and the earlier decision.
- `ProposalRow` (guide): the **Revised · N to check** row, the new-revision notice (`RevisedNotice` in `ProposalNotices.tsx`, with **Review**, absent with its review open) and the **Revised only (N)** filter in the Filters menu.
- `ReviewHeader` (guide): the "Revised by the agent on …" row. `NoteField` (guide): "From the withdrawn change: …".
- `ReviewRow` (guide): the mention of the **Revised only (N)** filter of the list.
- `Revisao.md`: the new section "Agent revision in the same proposal".
- `project/design-system.json`: only the `lastChange`.

## Ficou sem gravar

- Passou para o registro do épico `epic/sincronia-ds-2`: the new states (Revised badge, Revised · N to check row, Before the revision block, revision row in the header, withdrawn-change note, Revised only filter) in the `Flag`, `ProposalRow`, `ChangePopover`, `ReviewHeader`, `NoteField` and `ReviewRow` previews, and three guide corrections (filter, header, badge).
- Passou para o registro do épico `epic/sincronia-ds-2`: no component of its own: `RevisedBefore.tsx` goes into the "With a visible shape and no component in the DS" list; the new-revision notice (`ProposalNotices.tsx`) was already in it; creating a component is up to the owner.
- Passou para o registro do épico `epic/sincronia-ds-2`: the contrast check of the `new` badge and of the `.revised-before` block in both themes.
- Passou para o registro do épico `epic/sincronia-ds-2`: the `.revised-before` rule (and `.revised-before-title`) in `bundle.css`.
