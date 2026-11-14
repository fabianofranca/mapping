# Conversation state color — 2026-11-09 (épico `epic/cor-do-estado`)

## Pendências

- **New tokens:** `color-thread-human`, `color-thread-human-bg`, `color-thread-agent`, `color-thread-agent-bg`, `color-thread-resolved` and `color-thread-resolved-bg` (light and dark themes, in `src/theme/tokens.ts`): text and background of the conversation state badge, in the same hue as the state's `cv-pin-*`.
- **Recolored badges:** the state badge of the **Comments** window (`.comments-badge-human`, `-agent`, `-resolved`) and that of the **Conversations** section of Details (`.thread-state-*`) read only the new roles; they stop using `warning`, `accent`/`selection` and `success`.
- **Note:** pin (orange, cyan, gray), window and Details use the same hue per state. The canvas pin (`cv-pin-*`) and the "open" badge with no message (neutral) do not change.

## Sincronização

Not written to the Mapping artifact in Claude Design: the closing session has no access to the artifact (no Claude Design tool available). The pending items above carry over to the next sync.

## Ficou sem gravar

- Passou para o registro do épico `epic/sincronia-ds-2`: tokens `color-thread-human|agent|resolved` and `-bg` (six, in both themes) in `tokens.json`, with the contrast ratios in `Contraste.md` (text, DS3).
- Passou para o registro do épico `epic/sincronia-ds-2`: recolored badges `.comments-badge-human|agent|resolved` and `.thread-state-human|agent|resolved` in the `CommentsWindow` and `ThreadMessage` guides (text, DS3).
- Passou para o registro do épico `epic/sincronia-ds-2`: note on the same hue per state across pin, window and Details, in the `CommentPin` guide and in `Contraste.md` (text, DS3).
