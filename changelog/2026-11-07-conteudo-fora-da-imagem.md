# Content outside the image — 2026-11-07 (epic `epic/conteudo-fora-da-imagem`, PR #766, MCP 0.27.0, schema v17)

## Adicionado

- The `ref` can point to the whole annotation (`accepts.annotations`, value `{ "annotationId" }`), in specialization `formatVersion` 14; the project schema goes up to v17 (only the version changes; an old app opens the file read-only).
- In the app, the `ref` selector (field and table cell) offers the annotations accepted by `accepts.annotations`, with the label and the type name, and gets a filter by type; the value shows the label and leads to the target.
- The typed annotation card gets the **Referenced by** row, with the annotations that point to it as a whole (each in a button that selects it).
- The MCP (0.27.0): the batch accepts `{ "annotation" }` alone as a `ref` to the whole annotation, and `get_code_hints` expands the pointed-to component (`targets`).
- The agent guide gets the "Content outside the image" section (the "after" container, the event that points to the components and the complete batch).

## Alterado

- `get_code_hints` now includes, in each annotation, the `targets` of the fields and cells that are a `ref` to the whole annotation; `values` and `args` keep the label, for compatibility, and `types` include the targets' types.
- The new test script **R24 — Content outside the image** (`docs/TESTING.md`) joins the full round, in block 2.

## Corrigido

- Deleting a marking whose annotations are the target of a `ref` (whole annotation) from another annotation now warns, in the "Delete marking?" dialog, how many references will be left broken (and that it can be undone), as annotation and table row deletion already did.
- Script R24 (R24.12 and R24.13) reads the `broken reference` pending item in **Incomplete**, where it appears; Diagnostics only lists handled errors.
