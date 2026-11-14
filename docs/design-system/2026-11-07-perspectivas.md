# Perspectives — 2026-11-07 (épico `epic/perspectivas`)

## Pendências

PE3 — the perspectives interface (PR "PE3 — The perspectives interface"). Visual proposal approved: https://claude.ai/artifact/6rMomxsDEGyRWLkdt4NafD.

- **New icon `perspective`** (`src/ui/icons.tsx`): two rectangles side by side, the right one shorter, and a line below. It goes in the `Icons` group.
- **`PerspectivePicker`** (`src/ui/PerspectivePicker.tsx`, `src/theme/editor.css`): main bar button (icon, name in bold, "for everyone"/"only me"/"everything") and the list (`listbox`) with the groups For everyone (Main first) and Only mine, the open one marked, and New/Manage at the end; locked state in the review. `Layouts.md` section (main bar).
- **Dialogs** (`src/ui/NewPerspectiveDialog.tsx`, `ManagePerspectivesDialog.tsx`, `DeletePerspectiveDialog.tsx`, `src/theme/dialogs.css`): New perspective (label/field grid, Start from, Who sees it in `Segmented`, layers in checkboxes, name error with `role="alert"`), Manage (table with a Who sees it Select, inline rename, duplicate, delete; Main row with disabled actions) and the delete confirmation (`alertdialog`, Cancel focused, danger button). Cover in `ConfirmDialogs`.
- **Right-click menu** (`src/ui/PerspectiveMenuItems.tsx`, `src/theme/panels.css`): item with the submenu "Send to perspective ›" (checkboxes, locked rows "always"/"this one"), "Remove from this perspective" and the disabled item with the hint "Main only" (classes `.menu-submenu`, `.menu-heading`, `.menu-note`, `.menu-hint`, `.menu-check-slot`).
- **Details** (`src/ui/PerspectivesSection.tsx`, `ArrivalNotice.tsx`, `PerspectiveSendMenu.tsx`, `ArrowLinksSection.tsx`, `src/theme/details.css`): the Perspectives section, the "Came from…" notice with Dismiss and Next one that came (N), and the "outside this perspective" badge in the Linked by arrow section. Arrange and Delete buttons disabled with the hint outside Main.
- **Canvas** (`src/canvas/renderers/arrivals.ts`, `src/canvas/arrivals.ts`): the "Came from <name>" badge over the root and the dashed "Arrival area" strip. Uses existing canvas tokens (`badge`, `line`, `halo`, `selectSecondary`, `selectFill`, `text`, `textMuted`); no new token. `Canvas.md` section.
- **Status bar** (`src/ui/StatusBar.tsx`): the name of the open perspective and "N items came from other perspectives".
- **Tokens:** no new token.
- **Fix from the full round (phase PC):** the "Came from <name>" badge changed position, without changing appearance: from the top-left corner of the root to the bottom-left one (inside; on a small root, outside and below), always within the visible area. The "Send to perspective" submenu may open to the left of the parent (`.menu-submenu-left`), also opens on hover, and its rows are `menuitemcheckbox` with `aria-checked`. The status bar item became "Arrivals: N" (full sentence in the `title`). No new token.
- **Fix PC2 (`Canvas.md`):** the "Arrival area" label (title and hint) sits above the containers' name line and, with no room above, below the strip, always within the visible area; the "Came from <name>" badge leaves from under the minimap. No change of appearance or new token.

## Sincronização

Versões 56 (content) and 57 (index) of the artifact, from 2026-11-07. **New components (`README.md` guide only, no `preview.html`):** `PerspectivePicker`, `PerspectiveDialogs` (New perspective, Manage and Delete) and `PerspectivesSection` (Perspectives section, "Came from…" notice, "outside this perspective" badge). **Changed guides:** `ConfirmDialogs` (Delete perspective), `Menu` (Send to perspective ›, Remove from this perspective, "Main only" hint), `StatusBar` (open perspective and "Arrivals: N"), `Canvas.md` (arrival marks: "Came from…" badge and "Arrival area" strip, with the PC and PC2 fixes) and `Layouts.md`. **New icon:** `perspective` (89 icons). **`bundle.css`:** classes `.perspective-*`, `.arrival-notice`, `.arrow-link-outside`, `.menu-submenu*`, `.menu-heading`, `.menu-note`, `.menu-hint`, `.menu-check-slot`. **Tokens:** none new. Nothing was deleted.

## Ficou sem gravar

- Passou para o registro do épico `epic/sincronia-ds-2`: new previews of `PerspectivePicker`, `PerspectiveDialogs` and `PerspectivesSection` and perspective states in `ConfirmDialogs`, `Menu`, `StatusBar` and `CanvasMarking` (arrival marks) (DS5), plus `.menu-items-group` in `bundle.css` (DS3).
- Passou para o registro do épico `epic/sincronia-ds-2`: contrast and theme check of the perspective previews (DS5).
- Passou para o registro do épico `epic/sincronia-ds-2`: `PerspectiveDialogs` guide text on the copy's name when duplicating, checked against the code (`<name> (copy)`, the copy inherits Who sees it) (DS3).
