# Format plugins in the app — [Não lançado] (épico `epic/format-plugins-app`, PR #2607, MCP 0.58.0 provisional, schema v23 unchanged, specialization `formatVersion` 22 expected)

## Alterado

- The rules of the MCP batch for `add_container` with only a background, `create_marking` and `update_marking` now live in the model (`src/model/batchMarkings.ts`), so the app and the format import can apply them too. The batch behaves exactly as before: same results, same messages, same error codes.
- The rules of the MCP batch for `create_annotation`, `update_annotation` and `create_arrow` (values, table rows and their aliases, `ref` values, owner and role) also live in the model now (`src/model/batchAnnotations.ts`, with the reference lookups in `batchRefs.ts`), and `applyFormatResult` (`src/model/formatApply.ts`) applies a format plugin's result through them; `import_format` now uses it. The batch and `import_format` behave exactly as before: same results, messages and error codes. One test of the error registry (`tests/mcp/errorCodes.test.ts`) now counts a code raised only by a model batch rule as used.
- The `dist/index.html` ceiling rose 16 KiB, from 2441216 to 2457600, by the budget rule.
- The `dist/index.html` ceiling rose 64 KiB, from 2457600 to 2523136, by the budget rule; above the limits, `bug` #2656 for the owner to review.

## Corrigido

- A plugin result with a value of the wrong type (a text where a number goes, a flag that is not a boolean, an unknown anchor side or arrow style) is now refused at its path (`operations[3].rect.x`) before any rule reads it, instead of being coerced or failing with a vague error. The types and ranges are the MCP batch's; the MCP itself is unchanged.

## Adicionado

- **Export in a format** (project menu, when an applied specialization declares a file format): pick a format (and a container, for a format of scope `container`), and the app runs the specialization's `generate` and offers the text as `<project or container name>.<extension>` to save or share, like the zip. The project does not change and the export does not count as an export of the project. Specializations that declare file formats show a notice saying their code runs isolated, without network, disk or access to your projects.
- The plugin runs in a sandbox: a hidden iframe (`sandbox="allow-scripts"`, opaque origin) that starts a new Worker for every call, with no `fetch`, `XMLHttpRequest`, `WebSocket`, `importScripts`, `indexedDB`, `caches`, timers or `navigator`, a time limit (5 s) and size limits. The CSP of `dist/index.html` gains `worker-src blob:` and the hash of the sandbox bootstrap; Trusted Types accepts exactly the sandbox document. Nothing else about the CSP changes, and the guide and the viewer demo (`static` profile) are untouched.
- **Import from a format** (project menu, next to Export in a format; disabled while the project is read-only): pick a format that reads files, the target container (for a format of scope `container`; "None" lets the plugin create it) and the file, then **Preview** runs the plugin's `parse` on the project and shows how many containers, markings, annotations and arrows would be created and changed, with the plugin's warnings, or the error with its path. **Import** applies exactly that result in one step: one `Ctrl+Z` undoes the whole import, the created markings become the selection and the view goes to them. A file with another extension or above 4 MiB is refused before it is read, and the pending changes are saved before the plugin runs (if the save fails, nothing runs).
