# Narrow canvas bar — 2026-11-10 (épico `epic/barra-canvas-estreita`)

## Pendências

- **`Breadcrumbs`:** in the narrow canvas bar (container query, `max-width: 470px`), the middle of the path collapses and the **…** appears (`ActionMenu` with the `more` icon, compact), which opens the full-path menu (button name "Show full path", menu name "Full path"; the Canvas disabled and the last one with `aria-current`). With the **…**, the last segment loses the icon, and the Canvas shrinks before the selection. New texts: `crumbs.showFull` and `crumbs.menu`. Files: `src/ui/Breadcrumbs.tsx`, `src/theme/editor.css`.
- **`ActionMenu`:** new props `icon` (`more` or `moreVertical`), `menuLabel` and `className`, and `current` on the item (`aria-current`). File: `src/ui/ActionMenu.tsx`.
- **Canvas bar:** in the narrow review (container query, `max-width: 470px`) the `OverflowMenu` (`ActionMenu` with the `more` icon, compact, name "More controls" = `editor.moreControls`) sits at the end of the bar, before the zoom, and holds Conversations, View, Show on canvas, Fit all and Fit selection, with the same actions and keys as the buttons. New overflow menu pattern: the button carries the count badge and the unread dot of the conversations (like the `PinsButton`). To leave room for letters in the selection, the bar gap, that of `.canvas-bar-end` and the button are tight. The **Show on canvas** panel anchors to the "⋯" when its button is hidden (`Popover` with `anchor`) and returns focus to it. Files: `src/app/EditorTools.tsx`, `src/app/EditorWindows.tsx`, `src/ui/ViewModePanel.tsx`, `src/ui/Popover.tsx`, `src/theme/editor.css`.
- **`ActionMenu`:** new props `badge` and `alert` (badge and dot on the button) and, on the item, `checked` (becomes `menuitemcheckbox`, with `aria-checked` and the check) and `shortcut` (on the right). Files: `src/ui/ActionMenu.tsx`, `src/theme/details.css`.
- **`Popover`:** new prop `anchor` (element that anchors the panel in place of the host). File: `src/ui/Popover.tsx`.

## Sincronização

No write made by the agent: hand-curated artifact.

## Ficou sem gravar

- Passou para o registro do épico `epic/sincronia-ds-2`: `Breadcrumbs` in the narrow bar, the "…" with the `ActionMenu` and the keys `crumbs.showFull` and `crumbs.menu`: guide (text, DS3), `bundle.css` (text, DS3) and preview (preview, DS5).
- Passou para o registro do épico `epic/sincronia-ds-2`: `ActionMenu`, props `icon`, `menuLabel`, `className` and `current` on the item: `Menu` guide (text, DS3) and `bundle.css` (text, DS3).
- Passou para o registro do épico `epic/sincronia-ds-2`: canvas bar in the narrow review, `OverflowMenu` ("More controls") and the "Show on canvas" panel anchored to the "⋯": `Breadcrumbs` and `ViewModePanel` guides (text, DS3), `bundle.css` (text, DS3) and `Breadcrumbs` and `Menu` previews (preview, DS5).
- Passou para o registro do épico `epic/sincronia-ds-2`: `ActionMenu`, props `badge` and `alert` and, on the item, `checked` and `shortcut`: `Menu` guide (text, DS3), `bundle.css` (text, DS3) and `Menu` preview (preview, DS5).
- Passou para o registro do épico `epic/sincronia-ds-2`: `Popover`, prop `anchor`: `Menu` guide, which covers the `Popover` (text, DS3).
