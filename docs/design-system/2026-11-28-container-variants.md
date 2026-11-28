# Variants of a screen — 2026-11-28 (épico `epic/container-variants`)

## Sincronização

Gravado no artefato **Mapping** on 2026-11-28: version 118 (id `1795849449-b1a3`) adds `project/components/ContainerVariantsSection/README.md` (guide only, no preview: list of variants with truncated rows, "Missing here" block, **Link to variant…** menu, **Unlink**, and the states with no variants, with variants, read-only and no other container to link); version 119 (id `1795849463-8758`) is the index with `lastChange`. This was redone after the closing session's two refused publishes.

## Pendências

- **`ContainerVariantsSection` (new Details section of the container, VR3):** `src/ui/ContainerVariantsSection.tsx` (rows with the variant name, its classes and, on another page, the page name; **Link to variant…** `MenuPopover`; **Unlink**; the **Missing here** list), the `variants` section key in `src/store/ui.ts` and the `.variants-*` rules in `src/theme/details.css` (tokens only). Same family as `PerspectivesSection` (guide only, no preview): add the component to the "Sections" table of `docs/DESIGN-SYSTEM.md` and to the DS guide with the states (no variants, with variants, read-only, no other container to link). No new token, icon or control.
  - Truncation (CL1): the row name sits in its own `.variants-row-text` span (the button is inline-flex, where `text-overflow` does not apply), and the **Link to variant…** menu is anchored to `.variants-section` (not to its small button) with `max-width: 100%`, so long names truncate with `…` like the `.menu-item-name` of "Move to page". Tokens only.
