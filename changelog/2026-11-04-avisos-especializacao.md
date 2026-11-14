# Specialization notices — 2026-11-04 (epic `epic/avisos-especializacao`, PR #498, MCP 0.15.0, schema v13)

## Adicionado

- **Specialization `formatVersion` 10, with notices (`notices`)** on type, field and `table` column: each notice has `kind` (`pending`, `deprecated`, `diverges` or `removed`), `message` and, optionally, `since` (date) and `ref` (where it comes from). Notices only inform: none prevents importing, applying, creating an annotation or accepting a proposal, and they are not a pending item. They are outside the version contract (adding, changing or removing notices never requires a migration), so whoever generates the specialization can rewrite all of them every round and the notice goes away on its own when the difference between the sources goes away. Documented in `docs/SPEC-FORMAT.md` (section "Notices (notices)"), in the "Specializations" help, in `docs/spec.schema.json` and in the `spec-author` skill.
- **Notice badge in the type picker and in the Catalog.** A type with a notice shows a badge (Removed, Deprecated, Diverges or Pending, always with icon and text) in "+ Annotation", in the Components tab and in the Palette; the badge shows the highest-severity notice among the type's, the fields' and the columns', and the tooltip lists all of them.
- **Type, field and column notices in Details.** The type's notice sits at the top of the annotation (with `since` and `ref`), the field's below the control (and the label gains the icon) and the column's below the table. They also appear read-only, block nothing and do not make the annotation incomplete.
- **Notices window (`Ctrl+Shift+8`)** in the bottom window, between Incomplete and Diagnostics: lists each notice of the specialization, from most to least severe, with the place, the message and the annotations it affects (marking, layer, annotation and the value in the field). It filters by notice kind (with the count), by "Only notices in use" and by "Only visible layers", and picking a row takes you to the annotation. The tab shows how many annotations have a notice and the **status bar** gains "Notices: N" (goes away when 0; clicking opens the window). The Incomplete count does not change because of a notice.
- **Notices in the proposal review.** A change that creates an annotation of a type with a notice, switches the type to one with a notice or writes a value in a field or column with a notice shows the notice in its popover, in the style of the notice kind. Accept and Apply stay enabled.
- **MCP 0.15.0: notices for the agent.** `get_specialization` shows the `notices` of the type, the field and the column; `plan_changes` and `propose_changes` gain the `notices` key (`{ new: [{ annotation, type, kind, message, key?, column? }] }`, from most to least severe; `new: []` with no notice), next to `issues` and not mixed with it. A notice blocks neither the batch nor the proposal. `docs/MCP.md` and `docs/AGENT-GUIDE.md` say what to do with each `kind`; `validate_specialization` accepts v10 and rejects `notices` in v1 to v9 with the exact path.
- **Script R18 — Notices in the specialization** in the test guide (12 steps, for the cloud tester to run alone), in block 1 of the full round (now with 94 steps; 269 in total).

## Alterado

—

## Corrigido

—
