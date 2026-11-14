# Readable "before the revision" — 2026-11-07 (épico `epic/antes-da-revisao`)

## Pendências

- **Change popover (`ChangePopover`), "Before the revision" block:** one row per field (label of the specialization field or key of the pair + previous value) in place of a compact value; table values as one line of text per record (`white-space: pre-line`); `ref` by the target's label.
- **`Popover`:** new positioning behavior with an optional limit (`limit`): the review marker does not cover the review bar and, with no room below or above, opens to the side with more room, with a maximum height and inner scrolling. No new token.

## Sincronização

Nothing to write to the **Mapping** artifact in this close: the "Before the revision" block (rows per field) and the positioning behavior of the `Popover` with a limit are recorded in Pendências and wait for the next sync, with no new token or icon. The artifact was not opened.

## Ficou sem gravar

- Passou para o registro do épico `epic/sincronia-ds-2`: the per-field "Before the revision" block: `ChangePopover` guide (text, DS3) and a new state in the `ChangePopover` preview (DS4).
- Passou para o registro do épico `epic/sincronia-ds-2`: the position of the `Popover` with `limit`: one sentence in the `ChangeMark` and `ChangePopover` guides (text, DS3); no token or preview.
