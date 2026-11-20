# Batch preview and scratch folder — [Não lançado] (MCP 0.51.0, schema v22 unchanged)

Schema unchanged. Details in #2090.

## Adicionado

- A read-only scratch folder for the batch's temporary files: the server option `--scratch <folder>` (repeatable). The `operationsFile` of `plan_changes` and `propose_changes` and the image files the batch reads (the `file` of `add_container` and the like, such as screens exported from Figma) can live there, so temporary files no longer have to sit among the libraries and projects. The server writes nothing in it and never looks for projects or specializations in it; the library package of `apply_specialization` and `update_specialization` still comes from the roots. `list_projects` shows the folders in `scratch` and, for the ones that do not exist, in `missingScratch` (#2090).
- `revise_proposal` accepts `operationsFile` (from a root or the scratch folder), with the same rules as `plan_changes` and `propose_changes` (#2090).
