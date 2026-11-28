# Variants of a screen — 2026-11-28 (épico `epic/container-variants`)

## Sincronização

Sem gravar: the DS artifact **Mapping** was not written in this closing (version 1795829466-52f5 unchanged). The write of `project/components/ContainerVariantsSection/README.md` and of the index `lastChange` was refused (first by the artifact service as stale, then by the permissions classifier of the closing session). The text of the guide is in the item below, ready to publish.

## Pendências

- **`ContainerVariantsSection` (new Details section of the container, VR3):** `src/ui/ContainerVariantsSection.tsx` (rows with the variant name, its classes and, on another page, the page name; **Link to variant…** `MenuPopover`; **Unlink**; the **Missing here** list), the `variants` section key in `src/store/ui.ts` and the `.variants-*` rules in `src/theme/details.css` (tokens only). Same family as `PerspectivesSection` (guide only, no preview): add the component to the "Sections" table of `docs/DESIGN-SYSTEM.md` and to the DS guide with the states (no variants, with variants, read-only, no other container to link). No new token, icon or control.
  - Truncation (CL1): the row name sits in its own `.variants-row-text` span (the button is inline-flex, where `text-overflow` does not apply), and the **Link to variant…** menu is anchored to `.variants-section` (not to its small button) with `max-width: 100%`, so long names truncate with `…` like the `.menu-item-name` of "Move to page". Tokens only.

## Ficou sem gravar

- `ContainerVariantsSection` (new Details section of the container, VR3): guide only, no preview, in `components/ContainerVariantsSection/README.md` of the artifact (list of variants with truncated rows, "Missing here" block, **Link to variant…** menu, **Unlink**, states with no variants, read-only and no other container to link). Motivo: the `publish` to the artifact was refused twice in the closing of #2034 (the artifact service answered "You haven't viewed the latest version" twice even after re-reading the index, and the second attempt, with only the README, was denied by the permissions classifier as an unsanctioned write); nothing was written, so the item stays here for the next epic's closing, or for the owner to authorize the write.
