# Design system sync — 2026-11-02 (épico `epic/sincronia-ds`)

## Sincronização

First sync through the process. Versions 14 (content) and 15 (index) of the artifact. **Proposed with components:** `Revisao.md` and `Canvas.md` moved to the present tense (the "not yet implemented" notes and the "To implement" list are gone), and `ComponentDrawing`, `ChangeMark`, `ChangePopover`, `ReviewBar`, `ReviewHeader` and `OtherChanges` gained the created mark and the ghost in both views. **Suggestions in the field:** `TextField` gained the "Suggestions" and "List states" sections and the preview gained three cards; `PropertyGrid`, `DataGrid` and `ReferenceField` gained the suggested vocabulary and the `linkedRef`. **Remote images:** `ComponentDrawing` and `Canvas.md` gained the `image` node; `SettingsDialog` gained the Privacy section, with the four keys and the list of sources. **Material 3:** `CodeDefinitions` gained the `values` prop and the variant resolution; `CatalogPage` gained the variants table. **Parent marking:** `MultiSelectionPanel` gained the Wrap button; `LayerGroup` and `Breadcrumbs` gained the hint on the truncated name. **Tokens:** `size-grid-col-min` and the roles `control-height`, `control-height-sm`, `control-radius`, `control-icon`, `control-check` and `row-height` were added.

### Corrections to the record itself

The 2026-11-02 sync found three errors in the list of pending items that DS1 put together, all already fixed above:

- The hint (`title`) on the truncated name was attributed to `TreeRow`, which was already correct (there only the arrow row has `title`). The right component is `Breadcrumbs`, the path above the canvas.
- `KeyValueGrid` was listed as affected by the suggested vocabulary. The key and value cells of the free annotation do **not** have a list: the vocabulary belongs to the `string` fields and columns of the specialization. The guide gained this clarification.
- The pending item said the `review.legend.rejected` string no longer existed in `src/`. The key exists (`src/i18n/review.ts`); what left its text was the "(only in Current)".
