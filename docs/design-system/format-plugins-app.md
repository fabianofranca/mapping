# Format plugins in the app — [Não lançado] (épico `epic/format-plugins-app`)

## Pendências

Pending items of AF3 (the DS has to learn them; nothing was written to the artifact):

- **Export in a format dialog** (`src/app/FormatExportDialog.tsx`, a `Dialog` with a `Select` for the format, a `Select` for the container when the format has scope `container`, a muted isolation line, a `role="status"` line while it runs and a `notice notice-error` line with `role="alert"` on failure). It reuses `Dialog`, `Select` and `Button`; no new token, control or icon. Toca em: `src/app/*Dialog*.tsx` (the `ConfirmDialogs` and `Layouts.md` rows of `docs/DESIGN-SYSTEM.md`) and `src/app/EditorMainBar.tsx` (project menu: a new "Export in a format…" item that shows when an applied specialization declares a format).
- **`ExportDialog` with `format`** (`src/app/ExportDialog.tsx`): its own title ("Export in a format"), the size line "Text file · {size}" and no download hint, for the file a plugin generated.
- **Specializations notice** (`src/ui/SpecsDialog.tsx`): a `muted` paragraph under an applied specialization that declares file formats ("Brings N file format(s); their code runs isolated, without network, disk or access to your projects."). Toca em: `src/ui/**` outside `controls/` (the `SpecsDialog` window).

Pending items of AF4 (the DS has to learn them; nothing was written to the artifact):

- **Import from a format dialog** (`src/app/FormatImportDialog.tsx`, a `Dialog` with a `Select` for the format, a `Select` for the "Target" container when the format has scope `container` — its first option is "None (the plugin creates it)" —, a `Button` that opens the hidden file input of the format's extension with the chosen name beside it, a muted isolation line, then the preview: a small `import-preview-table` (rows containers, markings, annotations and arrows; columns created and changed), the plugin's warnings and the rules' notes as lists, or a `notice notice-error` line with `role="alert"` and the failing path). Actions: Cancel, Preview, and a primary Import that stays disabled until a preview succeeds and while the project is read-only. It reuses `Dialog`, `Select` and `Button`; no new control or icon, and the new `import-preview*` classes in `src/theme/dialogs.css` use tokens only (`--space-*`, `--color-border`, `--color-text-muted`, `--t-text-small`, `--t-micro`, `--t-text-heading`). Toca em: `src/app/*Dialog*.tsx` (the `ConfirmDialogs` and `Layouts.md` rows of `docs/DESIGN-SYSTEM.md`) and `src/app/EditorMainBar.tsx` (project menu: a new "Import from a format…" item next to Export in a format, shown when an applied specialization declares a format).
- The format and container pickers now come from `src/app/formatDialogParts.tsx`, shared with the Export dialog; no visual change.

Pending: AF5 (the "File formats" page of the Catalog) is expected to add its own item.
