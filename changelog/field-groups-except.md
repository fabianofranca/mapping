# `except` in a slot's `accepts`; field groups and `visibleWhen` in Details — [Não lançado] (épico `epic/field-groups-except`, PR #3053, MCP 0.66.0, schema v25 unchanged, specialization formatVersion 26)

## Adicionado

- Specialization `formatVersion` 26: `except` in a clause of a slot's `accepts` (`{ "layer": "actions", "except": ["lazy-vertical-scroll"] }`), a whole layer (or some of its groups) minus the listed types. A child of an excluded type in that slot is the existing `slot-not-accepted` pending item, placement skips the slot for that type, and `get_marking` and `get_component` list `accepts` without it. `except` is outside the version contract; `allowedChildren` and `accepts.annotations` still refuse it; libraries of `formatVersion` 1 to 25 validate as before (#2952, #2918).
- `validate_specialization` and `validate_library` accept `except` and check it (a non-empty list of unique types that the clause covers).

## Alterado

- Teto do `dist/index.html` subiu 16 KiB, de 2768896 para 2785280, pela regra do orçamento; acima dos limites, `bug` #3059 para o dono revisar.
