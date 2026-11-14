# Narrow status bar — 2026-11-08 (épico `epic/barra-status-estreita`)

## Pendências

- **StatusBar:** item priority (never shrink: write state, destination, Read-only, cursor, zoom and version; shrink with an ellipsis and a tip, in this order: perspective and "waiting for apply", then unexported, warnings, conversations and arrivals, and last the selection name, with a minimum width of 96 px). All text goes in `.status-item-text`. Below 1100 px of bar (container query), schema and channel disappear along with the separators.
- **Canvas bar (`.canvas-bar`):** is a container (`container-type: inline-size`); in the review with the bar below 470 px, Conversations, Fit all, View and Show on canvas (`.canvas-bar-low`) disappear and the path segments before the last one collapse, so the path (`Breadcrumbs`, including "Nothing selected") shows the selection with an ellipsis, and the zoom and Current/Proposed stay whole.
- **Breadcrumbs:** tip (`title`) on the cut-off path name, which shrinks with an ellipsis before the review controls.

## Sincronização

No write made by the agent: artifact curated by hand.

## Ficou sem gravar

- Passou para o registro do épico `epic/sincronia-ds-2`: `StatusBar` guide (item priority, 1100 px container query) and `Breadcrumbs` guide (canvas bar as a 470 px container; the `title` of the cut-off name was already written), with the classes in `bundle.css` (DS3).
