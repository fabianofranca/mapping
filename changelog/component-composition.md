# Component composition — [Não lançado] (épico `epic/component-composition`, PR #2292, MCP 0.48.0, schema v21)

Component format 4, specialization unchanged, schema next free in CC3.

## Adicionado

- The `component` node (component format 4): a template node that names another component of the library, with `values` for its fields and its own `provide`. `validate_library` checks it at levels 1 and 2 (unknown type, type without a component, an inner component with a slot or `screen`, fields, required fields, enum options, table and ref fields, and cycles). The node is drawn: the inner component is instantiated in the node's box with its own values, size and warnings, and the node's `provide` reaches the inner `$provided`. It draws the same in the app, in the `render_marking` and `render_container` PNG of the MCP and in the viewer (`mapping-viewer` 0.5.0). Editing the inner component's file redraws every outer component that draws it, in the app and in the MCP. An inner component that is not available (unknown type, a cycle, nesting deeper than 8 levels) draws nothing and warns `component not available: <id>`.
- In progress: the anchor's corner alignment.
