# Component composition — 2026-11-20 (épico `epic/component-composition`, PR #2292, MCP 0.48.0, schema v22)

Component format 4, specialization unchanged, project schema v22.

## Adicionado

- The `component` node (component format 4): a template node that names another component of the library, with `values` for its fields and its own `provide`. `validate_library` checks it at levels 1 and 2 (unknown type, type without a component, an inner component with a slot or `screen`, fields, required fields, enum options, table and ref fields, and cycles). The node is drawn: the inner component is instantiated in the node's box with its own values, size and warnings, and the node's `provide` reaches the inner `$provided`. It draws the same in the app, in the `render_marking` and `render_container` PNG of the MCP and in the viewer (`mapping-viewer` 0.5.0). Editing the inner component's file redraws every outer component that draws it, in the app and in the MCP. An inner component that is not available (unknown type, a cycle, nesting deeper than 8 levels) draws nothing and warns `component not available: <id>`.
- The anchor's corner alignment: `align` gains `corner-start` and `corner-end`, on the component root's `anchor` (component format 4) and on a marking's `anchor` (project schema v22). The marking's center sits on the anchor's corner (`top` + `corner-end` is the top-end corner, the right one in `ltr` and the left one in `rtl`) and stays there when the marking grows, so a Badge on a bare icon keeps its center through `3`, `12` and `99+` with Arrange in the app or `fit_marking` + `snap_to_anchor` in the MCP. `offset.main` moves outward from the corner and `offset.cross` along the side. The MCP `align` enum, `get_marking` and `get_code_hints` carry the two values; the proposal stays at `formatVersion` 9. The app's Anchor section offers it with the **On the corner** box.

## Alterado

- Project schema v22 (only the number changes in the migration): an earlier app opens a file with a corner value read-only. The example projects and the invalid-file fixtures were rewritten to v22.
- Test script R38, "Composed components and the corner anchor" (in block 6 of the full round), covers the node, the example package `examples/libraries/composition/` and the corner anchor in the app and in the MCP; the scripts that quoted schema 21 now quote 22.
