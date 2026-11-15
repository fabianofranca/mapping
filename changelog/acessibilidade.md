# Accessibility as a concept of the format — [Não lançado] (épico `epic/acessibilidade`, PR #1994, MCP 0.43.0, schema v20)

## Adicionado

- Specialization `formatVersion` 18: `accessibility` on the root (`touchTarget` `{ width, height, mode? }` in component units, `visual` by default or `expanded` when the platform grows the touch area to the minimum) and on the type (`role` from a closed list of WAI-ARIA names, `label` with the fields that give the accessible name, `touchTarget` or `false`, and `parts` for icons and items that come by field or by table row). In a `formatVersion` 17 or lower the keys are `only allowed with formatVersion 18`; the validation reports an unknown `role`, a `touchTarget` on a type without an interactive role, a `label` with a field that does not exist or is not `string` or `enum`, a part whose `when` is neither a field nor a table, a missing column, `fields` of another table, a repeated part `id` and a `touchTarget` on a part, at the exact path. `diffSpecs` does not count `accessibility` as a contract change.
- `accessibilityAudit` (`src/model/accessibility.ts`), a pure and linear audit: the pending item `accessible-label-missing` (a type or part with a required label and every label field empty, with the part and the table row) and the warning `touch-target-small` (a marking of an interactive type below the minimum converted by the container's density, with a 1 px tolerance; it is not a pending item and not counted in Incomplete). It audits the parts of a type with no role, skips the part of a field whose slot is full (`inactiveFields` of the drawing) and audits only the label of an annotation owned by an arrow.
- `docs/SPEC-FORMAT.md` ("Accessibility"), `docs/spec.schema.json`, `docs/AGENT-GUIDE.md`, `docs/ARCHITECTURE.md`, the `spec-author` skill and the `formatVersion` Help: the current version is 18.
- Test library `accessibility` (`tests/fixtures/accessibility`): a `button`, a bar with two field parts and a slot with a `fallback`, an `icon-button` and a type with a table part per row.
- Performance: the audit joins the derived-state budget of `tests/model/performance.test.ts` (8 ms per frame) and the growth tests of `npm run test:scale`.

## Alterado

- The `dist/index.html` ceiling went up 16 KiB, from 2211840 to 2228224 bytes, by the budget rule (the format version 18 validation and its messages in two languages add 11430 bytes over `main`); above the limits, `bug` #1992 for the owner to review.
