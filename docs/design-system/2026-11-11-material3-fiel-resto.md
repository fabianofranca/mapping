# Faithful Material 3, the rest — 2026-11-11 (épico `epic/material3-fiel-resto`)

## Pendências

- `ComponentDrawing` (`src/canvas/components/renderScene.ts`, `screenRenderer.ts`, `src/model/components/strokeGaps.ts`, `provided.ts`): the drawing now follows `font.align: justify`, the list of up to 4 shadows with `spread`, `stroke.gap`, the new `fit` values of the `image` node, `over` on the color `$token` and `provide`/`$provided`. No new token, icon or measure.
- `CatalogPage` (`src/ui/catalog/CatalogPage.tsx`, `src/theme/catalog.css`): the code parameter list gains the arrow between name and value (`.catalog-kv-params`) and the platform notes are read as Markdown.

## Sincronização

Gravado no artefato **Mapping** on 2026-11-11: version 79 (`1794362725-9b46`), in a single publish, with the index last and `lastChange` "Claude Code (epic material3-fiel-resto, closing)":

- `components/ComponentDrawing/README.md`: new paragraph "Text, shadow, image and inherited color (format 4, faithful Material 3)" and the new files in "In the code".
- `components/CatalogPage/README.md`: paragraph "Code parameters" and the `.catalog-kv-params` class in "In the code".
- No token, icon, `bundle.css` or `tokens.json` changes: the epic does not touch them.

## Ficou sem gravar

- New example in `components/ComponentDrawing/preview.html` (listed shadows, outline gap, justified text). Motivo: the preview is a static rendering with theme shapes and colors (Konva does not render outside the app), so it does not draw the format 4 features; the rule for each one was written in the README.
