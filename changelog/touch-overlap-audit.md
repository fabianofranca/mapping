# Touch overlap audit — [Não lançado] (épico `epic/touch-overlap-audit`, PR #3117, MCP 0.72.0, schema v26, unchanged)

## Alterado

- `get_marking` carries `typeAccessibility` (the resolved `accessibility` of each distinct type of its annotations, keyed `<specId>/<typeId>`) once per type, and the `type` of each annotation no longer repeats `accessibility`; `get_annotation`, `get_component` and `get_code_hints` are unchanged (#1998).
