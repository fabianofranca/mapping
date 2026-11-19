# Bottom window tabs — 2026-11-19 (épico `epic/abas-inferiores`)

## Pendências

- `Tabs`: the `compact` item (icon only inside a narrow container, label in `.tab-label`, icon in `.tab-icon`), the bottom window's `padding: 0 var(--space-1)` (8 px between tabs), and the accessible name with the count (`aria-label` = name + space + count) with the badge `aria-hidden` (AI1).
- `NoticesView` and `BottomTabs`: Notices and Diagnostics icon-only in the narrow bottom window (`@container bottom-window (max-width: 470px)`) (AI1).
- `DataGrid`: Incomplete in the narrow window, with the layer under the marking, the Layer column hidden, ellipsized headers with a tooltip, and `LayerCell` with `title` (AI2).
- `NoticesView`: the kind `Segmented` inside `.notices-kinds`, wrapping into separately bordered items in the narrow bottom window; the table with `.notices-table` (ellipsized headers with `title`, `.notices-cell` with `overflow-wrap: break-word`, narrow column widths and `--space-2` side padding) (CL1).

## Sincronização

Gravado no artefato **Mapping** on 2026-11-19: version 94 (content): notes on the narrow bottom window in `components/Tabs/README.md` (compact item, 8 px gap, accessible name with the count), `components/NoticesView/README.md` (kind `Segmented` wrapping, `.notices-table`) and `components/DataGrid/README.md` (Incomplete layer under the marking). No token, icon or preview change was needed. The `project/design-system.json` index (`lastChange`) was NOT written: see below.

## Ficou sem gravar

- The `lastChange` of `project/design-system.json`. Motivo: the Artifact `publish` of the index was denied by the permission classifier ("Unsanctioned Communication"), so the index still carries the epic `paginas` `lastChange`.
