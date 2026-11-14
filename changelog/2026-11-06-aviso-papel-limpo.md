# Cleared-role warning — 2026-11-06 (épico `epic/aviso-papel-limpo`, PR #600, MCP 0.19.0, schema v14)

## Adicionado

- MCP: `plan_changes` and `propose_changes` warn, before saving, when an `update_annotation` with `owner` clears the annotation's role without the step asking for it (the new owner does not offer the role, or `owner: null`). The `summary` step gains `; role "Clique" cleared` and `warnings` carries a `role-cleared` warning per annotation (`op`, `annotation`, `role`, `roleName`, `message`). The behavior does not change: the role is still cleared in the same operation, and the warning blocks nothing. It does not warn when the annotation had no role, when the new owner offers the same role or when the same step carries `role`.
