# Reserve swap and scratch paths — 2026-11-27 (épico `epic/reserve-swap-paths`, PR #3013, MCP 0.62.1, schema v24)

## Corrigido

- An open proposal that replaces a container (deletes it and creates another on the same spot) no longer blocks another batch with `images-overlap`: the space a proposal holds for a container it creates leaves out the containers the same proposal deletes. `plan_changes`, `propose_changes`, `revise_proposal` and the render previews share the fix.
- `operationsFile` and the image `file` of a batch accept a path that starts with the name of the scratch folder or of a root (`scratch/batch.json`, `projects/b.json`), as agents write it in a workspace; a path that resolved before resolves to the same file.
