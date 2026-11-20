# Hug fill and copy-field migration step — [Não lançado] (épico `epic/hug-fill-copy-field`, PR #2365, MCP 0.50.0, schema v22)

Schema unchanged. Details in #2164.

## Alterado

- A `fill` child on the main axis of a `hug` frame is now measured by its content (clamped by its limits and by the available limit) in every component `formatVersion`, instead of 0; the warning `fill inside hug becomes 0` no longer exists (#2164).
- `fit_marking`, Arrange, the creation without `rect`, `measure_component` and the `hug` `sizing` follow the new measurement; a nested `hug` frame whose `fill` child goes past its parent now warns `content larger than the box` in the drawing proof. The count over the 107 components of `libraries/`, `examples/libraries/` and `tests/fixtures/` found none that draws worse (#2164).
- The `dist/index.html` ceiling went up 16 KiB, from 2342912 to 2359296 bytes, by the budget rule (CF1: 4381 bytes over); above the limits, `bug` #2369 for the owner to review.

## Adicionado

- Specialization `formatVersion` 19 and the `copy-field` migration step, `{ type, from, to, when? }`: it copies a field (or a `table` column) into another one on the annotations of `type` that match `when` (an object of top-level fields, each with text, a number or a list of them), so a library update can split one field into two without losing the values. `from` keeps its value, `to` is only filled when empty, nothing is lost, and the step covers no break. The format validates it (`validate_specialization`, `validate_library`), the Help page, the schema, `docs/SPEC-FORMAT.md`, the `spec-author` skill and the agent guide describe it; before 19 the step is `only allowed with formatVersion 19` (#2164).
