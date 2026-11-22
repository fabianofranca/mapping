# Variant slots, transparent icons, the preview reserve and the scratch folder — [Não lançado] (épico `epic/slots-icons-scratch`, PR #2505, MCP 0.56.1, schema v23 unchanged)

## Corrigido

- a `variants` case's `slots` reach the resolved code, and a case with its own sheet no longer inherits base slots its composable lacks
- `import_icons` no longer counts a fully transparent `fill` or `stroke` (`transparent`, alpha 0) as a color: a one-color SVG with a `transparent` rect gives one path with `fill: true`, and a file with only transparent shapes reports `the SVG has no shape`
