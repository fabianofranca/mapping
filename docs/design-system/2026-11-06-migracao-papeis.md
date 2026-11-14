# Migration of link roles — 2026-11-06 (épico `epic/migracao-papeis`)

## Pendências

- **`UpdateImpact`** (PM2): new rows in the update dialog, with no new component, token or icon: the role steps ("Rename role A → B in T", "Remove role R in T (clear the role)" and "(unlink)", "Give role R to the children of T" and, with `childType`, "to the C children of T"), the count "N unlinked" next to the step counts, the losses "role R cleared" and "link removed (role R)", and the total with "and N link(s)" at the end of "This update deletes …". Update the `UpdateImpact` example in the artifact with a role step and the new loss.

## Sincronização

Gravado no artefato **Mapping** on 2026-11-06, at the close of the epic (version `1793938034-b403`; the index last, with `lastChange`):

- `UpdateImpact`, guide (`project/components/UpdateImpact/README.md`): new paragraph "Link role steps" (the labels of the three steps, the count "N unlinked", the losses "role R cleared" and "link removed (role R)", and the total with "and N link(s)"), the "Don't" and the test in "In the code". A cleared role counts as a value in the total; only unlinking counts toward "and N link(s)"; `rename-role` and `set-role` never generate a loss.
- `UpdateImpact`, preview (`preview.html`): three new cards at the end of the grid ("Role steps and cleared role", "Unlink: link removed" and "Give the role to the children (set-role)"), without touching the old cards.
- `project/design-system.json`: only the `lastChange`.

## Ficou sem gravar

- Passou para o registro do épico `epic/sincronia-ds-2`: checking the `@dsCard height=1200` card of the `UpdateImpact` preview in the real viewer, in both themes.
- Passou para o registro do épico `epic/sincronia-ds-2`: nothing to write: the `SpecsDialog` guide only mentions `UpdateImpact` in general and the en-US strings do not appear in the previews (the DS is pt-BR).
