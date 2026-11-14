# Migration of link roles — 2026-11-06 (epic `epic/migracao-papeis`, PR #616, MCP 0.20.0, schema v14)

## Adicionado

- Specialization `formatVersion` 12: three new steps in `migrations`, `rename-role`, `remove-role` (with `mode` `clear` or `unlink`) and `set-role` (with optional `childType`), which rename, remove and assign link roles on an owner's children. Only whoever declares a new step moves up to 12.
- The specialization update dialog shows the role steps (rename, remove with clear or unlink, assign role), the count of unlinked annotations, the losses of cleared role and undone link and, in the total, "and N link(s)"; a role break without a step refuses the update.
- MCP 0.20.0: `plan_library_update` and `update_specialization` return the role steps, the losses (`cleared-role` and `unlinked`, with the `role`), `unlinked` per step and the `missing-role` and `missing-owner` pending items; `validate_specialization` and `validate_library` accept `formatVersion` 12 and refuse the role step in an earlier version.
- New example `examples/specs/papeis-migracao.json` (`formatVersion` 12) with `rename-role` (which merges two roles) and `remove-role` with `clear` and `unlink`; R19 scripts for the refusal without the step, the three steps and v11 with a role step.

## Alterado

- Renaming or removing a role (`childRoles`) and assigning roles to an owner that had none are now breaks of the version contract: an update without the step that covers them is refused, like the other breaks.
- The SDUI example (`formatVersion` 12, version 4) assigns the roles in the 3→4 migration with four `set-role` (`click`, `hold` and `change`): whoever updates from v3 gets the links with a role and no `missing-role` pending item.
