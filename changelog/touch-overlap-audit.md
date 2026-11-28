# Touch overlap audit — [Não lançado] (épico `epic/touch-overlap-audit`, PR #3117, MCP 0.72.0, schema v26, unchanged)

## Adicionado

- The `touch-target-overlap` warning (app and MCP): two interactive annotations of different markings in the same space, neither inside the other and at least one `expanded`, whose touch areas meet by more than 1 px on each axis. It shows in the marking panel and in the Notices window, in `audit` of `get_marking` and `get_annotation`, and in `warnings` of `plan_changes` and `propose_changes` (one finding per annotation of the pair, naming the other; not a pending item, not counted in Incomplete) (#1998).
- The `touchTarget.spacing` opt-in of specialization `formatVersion` 27 (the WCAG 2.5.8 spacing exception), at the root and on a type: `true` needs `mode` `visual` and a square minimum, `false` is the same as no key, and a specialization without the key stays at its version. `validate_specialization` and `validate_library` check it; the audit that reads it comes in a later phase (#1998).
- The WCAG 2.5.8 spacing check: with `touchTarget.spacing: true`, an undersized `visual` target passes when a circle of the minimum's diameter around it is clear, and otherwise its `touch-target-small` also names the first neighbor in the way (`— too close to <name>` in the app and in the `plan_changes` message, `spacing: { other }` in `audit` and `warnings`) (#1998).

## Alterado

- `get_marking` carries `typeAccessibility` (the resolved `accessibility` of each distinct type of its annotations, keyed `<specId>/<typeId>`) once per type, and the `type` of each annotation no longer repeats `accessibility`; `get_annotation`, `get_component` and `get_code_hints` are unchanged (#1998).
- The Material 3 (Compose) library is at `version` 19 (additive, no `migrations`; `formatVersion` stays 18): the Fidelity of its ten `expanded` types now says the overlap of the touch areas between neighbors is audited (`touch-target-overlap`) instead of citing #1998, and `examples/material3-compose.zip`, `examples/full-example.zip`, the example's `mapping.json` and the version texts of R3, R17 and R29 follow. New test script R56 (Touch area overlap and spacing, 16 steps) in block 1 of the full round (#1998).
- The `dist/index.html` ceiling rose 16 KiB, from 2818048 to 2834432 bytes, by the budget rule; above the limits, `bug` #3127 for the owner to review
