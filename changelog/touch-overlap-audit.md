# Touch overlap audit — [Não lançado] (épico `epic/touch-overlap-audit`, PR #3117, MCP 0.72.0, schema v26, unchanged)

## Adicionado

- The `touch-target-overlap` warning (app and MCP): two interactive annotations of different markings in the same space, neither inside the other and at least one `expanded`, whose touch areas meet by more than 1 px on each axis. It shows in the marking panel and in the Notices window, in `audit` of `get_marking` and `get_annotation`, and in `warnings` of `plan_changes` and `propose_changes` (one finding per annotation of the pair, naming the other; not a pending item, not counted in Incomplete) (#1998).

## Alterado

- `get_marking` carries `typeAccessibility` (the resolved `accessibility` of each distinct type of its annotations, keyed `<specId>/<typeId>`) once per type, and the `type` of each annotation no longer repeats `accessibility`; `get_annotation`, `get_component` and `get_code_hints` are unchanged (#1998).
