# Container context — 2026-11-21 (épico `epic/container-context`)

## Pendências

- **`ContainerClassField` (`src/ui/ContainerClassField.tsx`, CX3):** a new Details property of the container, next to density and direction. It is a composition of `Property` and the `Select` control (size `sm`) with no shape of its own, plus a read-only `props-text` line per computed set; it adds no token and no style. To map in the DS as part of the container Details, not as a component.
- **Diagnostics section "Container classes" (`DiagnosticsContainerClasses` in `src/ui/DiagnosticsView.tsx`, CX3):** a new section with the same shape as the "Drawing mode" one (heading, hint, list), listing the undeclared stored choices. Same pattern as `DiagnosticsDrawingMode`; no new component.
- The pending item `outside-container-class` is a text of the existing **Incomplete** list and Details alert: no visual change.
- **Catalog Documents group and library document page (`CatalogView.tsx`, `LibraryDocumentPage.tsx`, CX5):** the Catalog list gains a **Documents** group above the layers (same row shape and arrow-key navigation as a layer's types, filtered by the same search), and a document opens a new page that reuses `DocumentBody` of the type's Document section (the five states). Reuses `.catalog-layer*` and `.catalog-entry`; no new token or style. To map in the DS as part of the Catalog.

## Sincronização

Gravado no artefato **Mapping** em 2026-11-21: version 103. Two guides were updated and the index `lastChange` was filled in (written last, in the same call):

- `MarkingPanel/README.md`: the container Details paragraph gains **Container classes** (`ContainerClassField`, between Direction and Density): a `Property` plus `Select` (`sm`) per chosen set ("None" and the classes, with the `HelpTip` hint), a read-only `props-text` line per computed set, hidden when no applied specialization declares a set, and the pointer that undeclared stored choices go to the Diagnostics section. No token, icon or style.
- `CatalogPage/README.md`: a new **Library documents** paragraph (the **Documents** group above the layers in the `CatalogView` list, same `.catalog-layer` and `.catalog-entry` shape, arrow-key navigation and search by name and id; the `LibraryDocumentPage` that reuses `DocumentBody`) and `LibraryDocumentPage.tsx` in the code line.

Nothing else needed a write. The Diagnostics "Container classes" section has the same shape as "Drawing mode" and no DS guide exists for `DiagnosticsView` (it is listed in `docs/DESIGN-SYSTEM.md` under "With a visible shape and no DS component", not a pending item). The `outside-container-class` text only changes the wording of the existing Incomplete list and Details alert: no visual change. No color, spacing or style was touched, so there was no contrast to check in the light and dark themes.

## Ficou sem gravar

- The `preview.html` of `CatalogPage` and `MarkingPanel`: not redrawn. They are large hand-drawn pages (`MarkingPanel` 125 kB, `CatalogPage` 23 kB) and still show the earlier states (no Container classes row in the container Details, no Documents group or document page in the Catalog). **Motivo:** the pending items ask to map the pieces as part of the container Details and the Catalog, which the guides now do; redrawing the previews is a larger hand edit that would risk the authors' existing markup, and it needs a visual check in both themes that this session could not do.
