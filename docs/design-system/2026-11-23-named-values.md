# Named values v2 in the specialization — 2026-11-23 (épico `epic/named-values`)

## Pendências

NV1 to NV4 had none. NV5 (app): **Settings › Drawing mode** now has one `Select` per declared axis, labeled by the axis name (the `mode` axis keeps "Drawing mode"); **Details › container** has one "Follow the project" field per axis; the **Specializations window** `.spec-design` list shows the axes, a value per token in the default selection, `→ target` for an alias, composite fields, description, group and a `.badge` per notice. Only existing controls and tokens; no new component or icon.

## Sincronização

Gravado no artefato **Mapping** on 2026-11-23: version 113 (guides only, previews untouched; index `lastChange` filled in). No new component, token or icon: only three existing guides were updated, covering the pending items of NV5.

- `SettingsDialog` guide: the "Drawing mode" section now has one `Select` per declared axis (`tokens.axes`, or `tokens.modes` as the `mode` axis), labeled by the axis name; the `mode` axis keeps "Drawing mode". An undeclared stored entry reads "<entry> (not declared)", and a stored axis nothing declares stays listed. Code files `DrawingModeSettings.tsx` and `drawingModes.ts` added.
- `MarkingPanel` guide: Details of a container have one "Follow the project" field per axis (`ContainerDrawingModeField.tsx`), replacing the single "Drawing mode" field; the choice applies only to that container.
- `SpecsDialog` guide: the read-only `.spec-design` block lists the axes, one value per token in the default selection, `→ target` for an alias, the fields of a composite value, description and group lines, and a `.badge` per notice.

## Ficou sem gravar

None.
