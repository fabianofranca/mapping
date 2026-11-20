# Anchored markings are measured with the anchor they draw with — [Não lançado] (épico `epic/anchored-measure`, PR #2412, MCP 0.50.3, schema v22 unchanged)

## Alterado

- Anchored markings are measured with the anchor they are drawn with, and the right-to-left mirror uses one formula with shared anchor helpers (#1893).
- The mirror formula, the reader of a component's root `anchor`, the `$anchor.*` builder and the "does not fit" warning each live in one place now, with no change in what they compute; schema and formats unchanged (#1906).
