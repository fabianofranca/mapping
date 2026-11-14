# Pin state — 2026-11-08 (épico `epic/estado-do-pino`)

## Pendências

- **EP1 — state glyph on the pin and the badges** (`src/utils/threadStateGlyph.ts`, `src/canvas/commentPins.ts`, `src/canvas/renderers/commentPins.ts`, `src/ui/icons.tsx`, `src/ui/comments/CommentsWindow.tsx`, `src/ui/comments/ThreadView.tsx`, `src/theme/panels.css`, `src/theme/threads.css`). Components: the **`CommentPin`** gets the state glyph to the left of the label (12px on screen on the 16 grid, stroke 2, color `cv-pin-text`): person (awaiting human), 4-point spark (awaiting agent) and check (resolved); the pill grows 14px, and the draft pin (dashed) has no glyph; with several conversations the most urgent state applies. `Canvas.md` and `Contraste.md` ("Conversation pins"): the state is distinguishable in grayscale by the glyph, and the glyph text has the same contrast as the label. The **state badges** (`comments-badge` of the Comments window and `thread-state` of `ThreadMessage`/the Conversations section) get the icon before the text (`inline-flex`, `gap: var(--space-1)`; the text remains the accessible name). New icons in the `Icons` group ("Conversations" group; 90 with both): `thread-awaiting-human` (person silhouette: `M10.25 5.25a2.25 2.25 0 1 0-4.5 0a2.25 2.25 0 1 0 4.5 0Z`, `M3.5 13.5c0-2.6 2-4.2 4.5-4.2s4.5 1.6 4.5 4.2`) and `thread-awaiting-agent` (spark: `M8 2c.5 3.3 2.7 5.5 6 6-3.3.5-5.5 2.7-6 6-.5-3.3-2.7-5.5-6-6 3.3-.5 5.5-2.7 6-6Z`); `check` keeps the same drawing (now read from `threadStateGlyph.ts`). New tokens: none.

## Sincronização

No write to the Mapping artifact in Claude Design: the artifact is hand-curated and the orchestrator session has no access to it. The pending item above moves to "Ficou sem gravar", for whoever edits the artifact to apply.

## Ficou sem gravar

- Passou para o registro do épico `epic/sincronia-ds-2`: state glyph on the `CommentPin` (guide), state badges with icon (`CommentsWindow`, `ThreadMessage`), icons `thread-awaiting-human` and `thread-awaiting-agent` (upload to the Icons group, count 90 to 92 and the "Conversations" group) and the excerpts of `Canvas.md` and `Contraste.md` (DS3).
- Passou para o registro do épico `epic/sincronia-ds-2`: state color unified across pin, window and Details (#925): already resolved by the epic `epic/cor-do-estado` (`2026-11-09-cor-do-estado`), no edit.
