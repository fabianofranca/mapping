# The Page menu and the perspective picker fit in the window — 2026-11-27 (épico `epic/page-menu-overflow`)

## Pendências

- `PerspectivePicker`: the guide says that a long list scrolls inside the popover, the actions block stays pinned below it, the selected row is in view when it opens, and the rows take an inset focus ring (the scrolling list would clip the outside one). The Page menu has no component of its own in the map of `docs/DESIGN-SYSTEM.md`; it shares the `PickerList` shell with `PerspectivePicker`.
- `Menu`: `Popover` is the positioning base. A panel taller than both sides of its button opens on the side with more room, with a maximum height and inner scrolling.

## Sincronização

Versão 115 of the **Mapping** artifact (content and index, in a single publish; the previous one was 114). The `PerspectivePicker` guide got the paragraph on the long list (scrolls inside, pinned actions, selected row in view, inset focus ring, shared `PickerList` shell with the Page menu); the `Menu` guide got the paragraph on `Popover` placement and maximum height. No token or color was added, so no contrast check was needed.

## Ficou sem gravar

Nothing. The previews of `PerspectivePicker` and `Menu` were not changed (the preview is static markup with no scrolling state); this is not a pending item.
