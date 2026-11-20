# Batch preview and scratch folder — [Não lançado] (épico `epic/batch-preview`, PR #2385, MCP 0.51.0, schema v22)

Schema unchanged. Details in #2090.

## Adicionado

- A read-only scratch folder for the batch's temporary files: the server option `--scratch <folder>` (repeatable). The `operationsFile` of `plan_changes` and `propose_changes` and the image files the batch reads (the `file` of `add_container` and the like, such as screens exported from Figma) can live there, so temporary files no longer have to sit among the libraries and projects. The server writes nothing in it and never looks for projects or specializations in it; the library package of `apply_specialization` and `update_specialization` still comes from the roots. `list_projects` shows the folders in `scratch` and, for the ones that do not exist, in `missingScratch` (#2090).
- `revise_proposal` accepts `operationsFile` (from a root or the scratch folder), with the same rules as `plan_changes` and `propose_changes` (#2090).
- `render_container` and `render_marking` draw a batch (`operations` or `operationsFile`), an open proposal (`proposal`, its whole proposed state) or a batch over that proposal, without writing anything. The items a batch creates are cited by their `$alias` and come back with `provisional: true`; the images and library components that the batch or proposal brings are drawn too, and the new code `invalid-batch` refuses a batch with errors (#2090).
- The workspace gets the scratch folder: `--scratch scratch` in the five client configurations of `examples/workspace/` (and in this repository's `mappings-workspace/` and the stdio test client), `scratch/` in the `.gitignore`, the rule in the `AGENTS.md` block and the README notes (including the line a workspace created before this adds by hand). New test script R37 (preview of a batch and a proposal, and the scratch folder), in block 6 of the full round (#2090).
