# Interface texts, notice row and guide fixed — 2026-11-05 (épico `epic/textos-e-avisos`)

## Pendências

- **`NoticeBadge` (notice row, `NoticeLine`):** `.notice-line` becomes a two-column grid (`auto 1fr`, `align-items: start`): the icon stays in the left column, aligned to the first line, and the message (with `since` and `ref`) wraps in the right column. Before it was a flex with wrapping, and the icon sat alone above the long message. Tokens only (`--space-*`). File: `src/theme/details.css` (`.notice-line`). Update the "row" variant of `NoticeBadge` in the artifact.
- **Texts:** the Position and Size hint of the marking panel and the library text in Specializations changed (no visual impact).

## Sincronização

Gravado no artefato **Mapping** on 2026-11-05: version 35 (content) and version 36 (index, only with the `lastChange`).

- **`NoticeBadge`:** the guide (`README.md`) describes the two-column grid of the notice row (`auto 1fr`, `space-2` gap, `align-items: start`); `bundle.css` gained the new `.notice-line` rule (and `.notice-origin` and `.notice-since` in column 2), identical to `src/theme/details.css`; the preview gained a long-message example in a narrow column (`height` from 1700 to 1840).
- **Texts:** the Position and Size hint ("In container pixels" on the container marking, "In canvas units" on the canvas one) in the `MarkingPanel`, `PropertyGrid` and `HelpTip` previews, and the library text ("`formatVersion` 4 onward") in the `SpecsDialog` preview.
- **Contrast:** no impact (no color changed).

## Ficou sem gravar

Nothing. Only a visual check remains:

- Passou para o registro do épico `epic/sincronia-ds-2`: Check of the `NoticeBadge` preview ("Field row", long-message example) in both themes.
