# Draw mode notice in the canvas bar — 2026-11-09 (épico `epic/aviso-desenhar`)

## Pendências

- **`Breadcrumbs`** (guide): the empty state shows the Draw mode hint (`editor.drawHint`) in place of "Nothing selected" when the mode is Draw, with no selection, the project not locked and a container in view; it shrinks with an ellipsis and carries a `title` with the full text.
- **Canvas notices** (section): the Draw hint stops being a notice over the canvas (`.canvas-hint` removed from `.canvas-overlay`); the other notices stay.

## Sincronização

Gravado no artefato **Mapping** on 2026-11-09, at the epic close (version 67; the index along with it, with `lastChange`):

- `Breadcrumbs` (guide): the empty state with the Draw mode hint in place of "Nothing selected" (condition, ellipsis, `title`, `drawHintVisible`) and the tests cited.
- `Breadcrumbs` (preview): two cards, the Draw hint and the hint shrunk with an ellipsis at 150 px.
- `Layouts.md`: the "Canvas bar" row mentions the hint. The canvas row ("notices stacked at the top") did not change: the other notices stay.
- `project/design-system.json`: only the `lastChange`.

## Ficou sem gravar

- Passou para o registro do épico `epic/sincronia-ds-2`: check of the `Breadcrumbs` previews (Draw hint and hint shrunk with an ellipsis) in the light and dark themes (DS5), with `.crumbs-empty` complete and the dead `.canvas-hint` removed from `bundle.css` (DS3).
