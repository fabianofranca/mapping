# Dark theme and finishing touches — 2026-11-11 (épico `epic/tema-escuro-acabamento`)

## Pendências

- **`Container`:** the container title gains an outline in the surface color (`--color-surface`, 2 px screen thickness), so it reads over the image of any root in both themes. No new token.
- **`Canvas.md`:** the arrival badge ("Came from…") is inverted, like the hint: `--color-text` box and `--color-surface` label (dark on light, light on dark). Outline, radius and measures do not change.
- **`ref` field and cell (`.ref-control`):** the broken reference wraps between words (`overflow-wrap: break-word` and `min-width: min-content` on the broken cell), without splitting "reference".
- **`Home`:** the description of the recent-row buttons (`aria-describedby`) carries the last use with seconds, in a text only for the screen reader. No visible change.

## Sincronização

Gravado no artefato **Mapping** on 2026-11-11: version 80 (`1794364519-6f16`). Guide text, in the files `project/Canvas.md` (container title with a `color-surface` outline; inverted "Came from…" badge, `color-text` with a `color-surface` label, and the line about review and arrival tokens), `components/Container/README.md` (title outline), `components/RefCell/README.md` and `components/ReferenceField/README.md` (the broken reference wraps with `overflow-wrap: break-word`; in the cell, `min-width: min-content`) and `components/Home/README.md` (description of the recent-row buttons with seconds, only for the screen reader). Index `project/design-system.json` read right before and written last, with `lastChange`. No token, icon or file was added or deleted; `tokens.json` did not change (no new token).

## Ficou sem gravar

- Moved to the record of the epic `epic/sobras-do-testador`: previews of `Container`, `RefCell` and `ReferenceField` (title with the `--color-surface` outline and the broken reference wrapping between words in the cell at 900 px), to regenerate while checking the light and dark themes in a browser. The `Home` preview stays as it is: the change is only for the screen reader (`aria-describedby`).
- Moved to the record of the epic `epic/sobras-do-testador`: the "Came from…" badge (`Canvas.md`) gets no preview; it stays described in the guide, like the `CommentPin` (guide only, no preview), because it is Konva drawing and there is no DS component for it.
