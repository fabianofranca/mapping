# `except` in a slot's `accepts`; field groups and `visibleWhen` in Details — [Não lançado] (épico `epic/field-groups-except`, PR #3053, MCP 0.66.0, schema v25 unchanged, specialization formatVersion 26)

## Adicionado

- Specialization `formatVersion` 26: `except` in a clause of a slot's `accepts` (`{ "layer": "actions", "except": ["lazy-vertical-scroll"] }`), a whole layer (or some of its groups) minus the listed types. A child of an excluded type in that slot is the existing `slot-not-accepted` pending item, placement skips the slot for that type, and `get_marking` and `get_component` list `accepts` without it. `except` is outside the version contract; `allowedChildren` and `accepts.annotations` still refuse it; libraries of `formatVersion` 1 to 25 validate as before (#2952, #2918).
- `validate_specialization` and `validate_library` accept `except` and check it (a non-empty list of unique types that the clause covers).
- Specialization `formatVersion` 26 also adds `fieldGroups` on an annotation type (`[{ id, name, description?, visibleWhen? }]`), `group` on a top-level field and `visibleWhen` (`{ "<key>": value | [values] }`) on a top-level field or on a group, validated with exact errors (`only allowed with formatVersion 26` below 26, an undeclared or empty group, a condition on an unknown field, on the field itself, on a field of its own group or on a type other than `enum`, `string` or `number`, a table column, and `required` on a field that can be hidden). The keys are outside the version contract and change only what the Details panel will show; the data of a hidden field stays in the annotation and in `mapping.json`, and validation, pending items, MCP reads, `get_code_hints`, the drawing and the viewer ignore them. The Details display itself (collapsible groups, hidden fields) comes in a later phase (#2918).
- `validate_specialization` and `validate_library` accept `fieldGroups`, `group` and `visibleWhen` and check them.

## Alterado

- The `dist/index.html` ceiling went up 16 KiB, from 2768896 to 2785280, by the budget rule; above the limits, `bug` #3059 for the owner to review
