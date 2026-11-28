# `except` in a slot's `accepts`; field groups and `visibleWhen` in Details — 2026-11-28 (épico `epic/field-groups-except`, PR #3053, MCP 0.68.0, schema v25 unchanged, specialization formatVersion 26)

## Adicionado

- Specialization `formatVersion` 26: `except` in a clause of a slot's `accepts` (`{ "layer": "actions", "except": ["lazy-vertical-scroll"] }`), a whole layer (or some of its groups) minus the listed types. A child of an excluded type in that slot is the existing `slot-not-accepted` pending item, placement skips the slot for that type, and `get_marking` and `get_component` list `accepts` without it. `except` is outside the version contract; `allowedChildren` and `accepts.annotations` still refuse it; libraries of `formatVersion` 1 to 25 validate as before (#2952, #2918).
- `validate_specialization` and `validate_library` accept `except` and check it (a non-empty list of unique types that the clause covers).
- Specialization `formatVersion` 26 also adds `fieldGroups` on an annotation type (`[{ id, name, description?, visibleWhen? }]`), `group` on a top-level field and `visibleWhen` (`{ "<key>": value | [values] }`) on a top-level field or on a group, validated with exact errors (`only allowed with formatVersion 26` below 26, an undeclared or empty group, a condition on an unknown field, on the field itself, on a field of its own group or on a type other than `enum`, `string` or `number`, a table column, and `required` on a field that can be hidden). The keys are outside the version contract and change only what the Details panel will show; the data of a hidden field stays in the annotation and in `mapping.json`, and validation, pending items, MCP reads, `get_code_hints`, the drawing and the viewer ignore them.
- `validate_specialization` and `validate_library` accept `fieldGroups`, `group` and `visibleWhen` and check them.

- Details and the Catalog Playground show a type's field groups as collapsible subheadings (open at the start; the state holds per type and group for the session and makes no undo entry), hide the fields and groups whose `visibleWhen` does not hold, and end the typed fields with an "<n> hidden fields · Show" line that lists every hidden field until the selection changes. A hidden field with a pending item of its own, a review mark or text below it always shows. Editing the controlling field never clears the hidden values. A type without the keys renders as before (#2918).
- Test fixture `tests/fixtures/field-display/` (a `formatVersion` 26 package with a `scroll` slot that excepts `scroll`, a `column`, a `text` and a `decorated-text` with two conditional field groups) and the cloud test script R52 ("Slot except, field groups and conditional display", 12 steps, in block 7 of the full round) that covers the stage end to end.

## Alterado

- The `dist/index.html` ceiling went up 16 KiB, from 2768896 to 2785280, by the budget rule; above the limits, `bug` #3059 for the owner to review
- The `dist/index.html` ceiling went up 16 KiB, from 2785280 to 2801664, by the budget rule; above the limits, `bug` #3066 for the owner to review

## Corrigido

- A "go to" link of a pending item whose field sits in a collapsed field group now opens the group, so the field is reached and focused; "Show" for hidden fields no longer flashes on for the next selected annotation.
