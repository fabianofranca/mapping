# Variant slots, transparent icons, the preview reserve and the scratch folder — [Não lançado] (épico `epic/slots-icons-scratch`, PR #2505, MCP 0.56.1, schema v23 unchanged)

## Corrigido

- a `variants` case's `slots` reach the resolved code, and a case with its own sheet no longer inherits base slots its composable lacks
- `import_icons` no longer counts a fully transparent `fill` or `stroke` (`transparent`, alpha 0) as a color: a one-color SVG with a `transparent` rect gives one path with `fill: true`, and a file with only transparent shapes reports `the SVG has no shape`
- the preview over a proposal (`render_container` and `render_marking` with `proposal` and a batch) places new containers where `revise_proposal` puts them
- a relative `operationsFile` or image path through a symbolic link between a root and the `--scratch` folder resolves like its absolute path, in both directions; a link that leaves both is still `outside-roots`
- `create_marking` with `inside` and `slot` puts the child in a slot that is empty and takes its content's size (an `actions` slot without its label) on the side of the bar where the slot sits, with no "did not fit" warning, instead of below the bar's start

## Alterado

- the MCP server refuses to start (exit code 2, a usage error) when a `--scratch` folder and a `--root` overlap (inside, containing or the same folder, by path or by real path); the earlier advice to keep them apart is now enforced
