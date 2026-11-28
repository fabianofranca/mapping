# Variants of a screen — [Não lançado] (épico `epic/container-variants`, PR #3092, MCP 0.70.0, schema v26)

## Adicionado

- A container can be linked to others as the **variants of the same screen** (for instance compact and expanded): `containers[].variantGroup` in `mapping.json`, schema v26. The link is symmetric (no main container) and the variants can be on any page (#2034).
- The model and the store link, merge and unlink variants, one undo entry each (`linkVariant`, `unlinkVariant`); deleting a container or a page never leaves a group of one behind (#2034).
- `missingVariantTypes` lists the annotation types that another variant maps and this container lacks, skipping the types whose `appliesIn` excludes the container's class; it is informative and never a pending item (#2034).
- A proposal can link and unlink containers: the `variantGroup` field of a container and of a created container, written in proposal `formatVersion` 14 only when it carries one. The review shows "Variant of: …" with the names of the other containers, or "No variants" (#2034).
- The MCP links variants with `variantOf` in `add_container` and `update_container` (`null` leaves the group) and reads them: `get_container` returns `variants` and `missingTypes`, `get_project` lists `variants` on the containers that have them (#2034).
- The Details of a container have a **Variants** section: one row per other variant (name, classes and, on another page, the page name; clicking it opens that page and selects the container), **Link to variant…**, **Unlink** (one undo entry each) and a **Missing here** list with the types the variants map and this container lacks; read-only keeps the navigation (#2034).
- New test script R53 (Variants of a screen) in `docs/TESTING.md`, in block 6 of the full round; the schema number (v26) is swept through the scripts (#2034).

## Alterado

- The ceiling of `dist/index.html` went up 16 KiB, from 2801664 to 2818048, by the budget rule; above the limits, `bug` #3103 for the owner to review.
- The project schema is v26: a v25 project opens migrated with nothing else changed, the original goes to `backups/` before the first write, and an earlier app opens the new file read-only (#2034).
