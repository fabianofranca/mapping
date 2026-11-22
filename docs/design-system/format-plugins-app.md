# Format plugins in the app — [Não lançado] (épico `epic/format-plugins-app`)

## Pendências

Pending items of AF3 (the DS has to learn them; nothing was written to the artifact):

- **Export in a format dialog** (`src/app/FormatExportDialog.tsx`, a `Dialog` with a `Select` for the format, a `Select` for the container when the format has scope `container`, a muted isolation line, a `role="status"` line while it runs and a `notice notice-error` line with `role="alert"` on failure). It reuses `Dialog`, `Select` and `Button`; no new token, control or icon. Toca em: `src/app/*Dialog*.tsx` (the `ConfirmDialogs` and `Layouts.md` rows of `docs/DESIGN-SYSTEM.md`) and `src/app/EditorMainBar.tsx` (project menu: a new "Export in a format…" item that shows when an applied specialization declares a format).
- **`ExportDialog` with `format`** (`src/app/ExportDialog.tsx`): its own title ("Export in a format"), the size line "Text file · {size}" and no download hint, for the file a plugin generated.
- **Specializations notice** (`src/ui/SpecsDialog.tsx`): a `muted` paragraph under an applied specialization that declares file formats ("Brings N file format(s); their code runs isolated, without network, disk or access to your projects."). Toca em: `src/ui/**` outside `controls/` (the `SpecsDialog` window).

Pending: AF4 (the Import from a format dialog) and AF5 (the "File formats" page of the Catalog) are expected to add their own items.
