# Component composition — [Não lançado] (épico `epic/component-composition`, PR #2292, MCP 0.48.0, schema v21)

Component format 4, specialization unchanged, schema next free in CC3.

## Adicionado

- The `component` node (component format 4): a template node that names another component of the library, with `values` for its fields and its own `provide`. `validate_library` checks it at levels 1 and 2 (unknown type, type without a component, an inner component with a slot or `screen`, fields, required fields, enum options, table and ref fields, and cycles). It draws nothing yet.
- In progress: the anchor's corner alignment.
