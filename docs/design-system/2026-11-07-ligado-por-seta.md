# Linked by arrow — 2026-11-07 (épico `epic/ligado-por-seta`)

## Pendências

### LS1 — Linked by arrow section in the marking Details

- `MarkingPanel`: new collapsible section **Linked by arrow** (`Section` with a count), after **Annotations** and before "Other changes"; it only exists when the marking has an arrow. New preview or new state in the `MarkingPanel` guide.
- Arrow row (`.arrow-link`, `li` of a list without bullets): direction icon (`arrowRight` goes out, `arrowLeft` comes in, with the accessible name "Goes to" / "Comes from"), `ghost` `sm` `Button` with the name of the other end (selects the end; shrinks with an ellipsis), the arrow's name in secondary text and an `sm` `IconButton` with the `arrow` icon (**Select the arrow**, tip with its name). A removed end becomes neutral text, without a button.
- Row content, read-only: group by layer without a `LayerGroup` header (`.arrow-link-layer`: `.layer-dot` dot with `--layer-color` and name, never just the color), with `AnnotationTitle` and `AnnotationLines` (`.arrow-link-annotation`, `.arrow-link-line`, `.arrow-link-key`); **On the arrow** block (`.arrow-link-on-arrow`) with the same group; empty state "No annotations in the visible layers." (`.arrow-link-empty`). No `+`, no field.
- `AnnotationsPanel`: `PagedList` is now exported (the section reuses the review's pagination); no visual change.
- New icons: none (`arrow`, `arrowLeft`, `arrowRight`). New tokens: none.

## Sincronização

Versões 51 (content) and 52 (index) of the artifact, from 2026-11-07. **`MarkingPanel`:** the guide (`README.md`) gained the **Linked by arrow** section (arrow row with direction, end button, **Select the arrow**, read-only group by layer, **On the arrow** and the empty state) and its code file. No new icon or token. The `preview.html` was not changed.

## Ficou sem gravar

- Passou para o registro do épico `epic/sincronia-ds-2`: "Linked by arrow" state in the `MarkingPanel` preview (DS5) and the `.arrow-links`/`.arrow-link*` classes in `bundle.css` (DS3).
