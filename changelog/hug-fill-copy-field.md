# Hug fill and copy-field migration step — [Não lançado] (épico `epic/hug-fill-copy-field`, PR #2365, MCP 0.50.0, schema v22)

Schema unchanged. Details in #2164.

## Alterado

- A `fill` child on the main axis of a `hug` frame is now measured by its content (clamped by its limits and by the available limit) in every component `formatVersion`, instead of 0; the warning `fill inside hug becomes 0` no longer exists (#2164).
- `fit_marking`, Arrange, the creation without `rect`, `measure_component` and the `hug` `sizing` follow the new measurement; a nested `hug` frame whose `fill` child goes past its parent now warns `content larger than the box` in the drawing proof. The count over the 107 components of `libraries/`, `examples/libraries/` and `tests/fixtures/` found none that draws worse (#2164).
- The `dist/index.html` ceiling went up 16 KiB, from 2342912 to 2359296 bytes, by the budget rule (CF1: 4381 bytes over); above the limits, `bug` #2369 for the owner to review.
- The MCP's drawing (`render_container`, `render_marking`, the drawing proof) no longer cuts to `…` an `ellipsis` text that overflows its box by 1.5 px or less: its embedded font is a pixel or two wider than the app's, so a `fill` label of a `hug` chip that the app draws whole came out as `…`. The app and the model are unchanged (CL1).
- A `propose_changes` or `revise_proposal` that adds a container now counts the containers that the other open proposals add as taken space: two open proposals no longer get the same place, so applying the first does not block the second (CL1).

## Adicionado

- Specialization `formatVersion` 19 and the `copy-field` migration step, `{ type, from, to, when? }`: it copies a field (or a `table` column) into another one on the annotations of `type` that match `when` (an object of top-level fields, each with text, a number or a list of them), so a library update can split one field into two without losing the values. `from` keeps its value, `to` is only filled when empty, nothing is lost, and the step covers no break. The format validates it (`validate_specialization`, `validate_library`), the Help page, the schema, `docs/SPEC-FORMAT.md`, the `spec-author` skill and the agent guide describe it; before 19 the step is `only allowed with formatVersion 19` (#2164).
- `copy-field` runs: the app's library update (and its Undo, in one entry) and `update_specialization` / `plan_library_update` copy the values, with the step in the update dialog ("Copy {from} to {to} in {type}", with `when`) and in the MCP hints; `losses` is always empty (#2164).
- **Scripts (`docs/TESTING.md`):** R25.131 to R25.135 cover the `fill` label in a `hug` frame (the `m3-hug` and `m3-hug2` libraries that `scripts/testing/hug-fill.mjs` writes: widths 96, the content and 136, the two-label case, `fit_marking`, the creation without `rect`, Arrange and the drawing, in the app and in the MCP) and R19.30 to R19.35 cover `copy-field` (validation, refusal in `formatVersion` 18, `plan_library_update`, the app's update with its Undo and `update_specialization` in a proposal). R17.31 and R17.38 were checked against the new engine and stay as they are. R27 moved from block 3 to block 6 of the full round to keep block 3's guide under the ceiling (the ceiling did not change).
