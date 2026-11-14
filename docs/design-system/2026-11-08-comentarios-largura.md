# Comments window width — 2026-11-08 (épico `epic/comentarios-largura`)

## Pendências

- **`CommentsWindow` guide** (CL1, #802): the ⋯ column is the size of the button (`--control-height` plus `--space-1` on each side, without the cell padding); the status badge and the When cell are cut with an ellipsis (the badge carries a `title` with the label); the Status column becomes 19%. Narrow layout: below 640 px of window width (`comments-window` container query on the list's container) Msgs and When disappear (header and cells) and By shows only the avatar, with the name in the `title`.
- **Token `size-tw-bottom`** (CL2, #815): from 208 px to 360 px, the initial height of the bottom windows (criterion: 4 whole rows of the Comments list, with filters and header, at 900 × 720; `size-tw-bottom-review` does not change).
- **`CommentsWindow` guide, User filter** (CL2, #815): the first option is "Everyone", with no number; the person and agent options keep the conversation count.
- **`CommentsWindow` guide, filters in the narrow layout** (CL3, #887): below 640 px of window width the filters become a 2-column grid (Status | User, search | Citing selection), each control at 100% of the column.
- **`BottomTabs`/`Tabs` guide, counter** (CL3, #887): in the bottom window the `tab-badge` takes `padding: 0 --space-1` and the left margin of the counter and the alert drops to `--space-0-5` (the strip of 6 tabs fits at 900 px with room to spare).
- **`CommentsWindow` guide, resolved row** (CL4, #918): the anchor button (`.comments-anchor-button`) inherits the dimmed color (`--color-text-muted`) and `text-decoration: line-through` (before it stayed underlined and dark).
- **`CommentsWindow` guide, anchor cell** (CL5, #921): the anchor button and the unread dot sit in a `.comments-anchor-line` container (`display: flex`, `align-items: center`); the anchor shrinks (`flex: 0 1 auto`, `min-width: 0`) with an ellipsis and the dot does not shrink (`flex: none`), so every row has the height of one line.

## Sincronização

No write to the Claude Design Mapping artifact: the artifact is curated by hand and the orchestrator session has no access to it. The pending items above move to "Ficou sem gravar", for whoever edits the artifact to apply.

## Ficou sem gravar

- Passou para o registro do épico `epic/sincronia-ds-2`: `CommentsWindow` guide: columns (⋯ the size of the button, ellipsis on the badge and on When, Status 19%) and narrow layout below 640 px (DS3).
- Passou para o registro do épico `epic/sincronia-ds-2`: token `size-tw-bottom` from 208 to 360 px in `tokens.json` (and in the `Layouts.md` row) (DS3).
- Passou para o registro do épico `epic/sincronia-ds-2`: `CommentsWindow` guide, User filter with the first option "Everyone" (DS3).
- Passou para o registro do épico `epic/sincronia-ds-2`: `CommentsWindow` guide, filters in a 2-column grid in the narrow layout (DS3).
- Passou para o registro do épico `epic/sincronia-ds-2`: `Tabs`/`BottomTabs` guide, counter and tighter tabs of the bottom window (six tabs today; `ToolWindow` along with it) (DS3).
- Passou para o registro do épico `epic/sincronia-ds-2`: `CommentsWindow` guide, resolved row: already resolved (the guide says anchor struck through and dimmed), no edit.
- Passou para o registro do épico `epic/sincronia-ds-2`: `CommentsWindow` guide, anchor cell (`.comments-anchor-line`) (DS3).
