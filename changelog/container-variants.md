# Variants of a screen — [Não lançado] (épico `epic/container-variants`, PR #0, MCP 0.69.0, schema v26)

## Adicionado

- A container can be linked to others as the **variants of the same screen** (for instance compact and expanded): `containers[].variantGroup` in `mapping.json`, schema v26. The link is symmetric (no main container) and the variants can be on any page (#2034).
- The model and the store link, merge and unlink variants, one undo entry each (`linkVariant`, `unlinkVariant`); deleting a container or a page never leaves a group of one behind (#2034).
- `missingVariantTypes` lists the annotation types that another variant maps and this container lacks, skipping the types whose `appliesIn` excludes the container's class; it is informative and never a pending item (#2034).
- A proposal can link and unlink containers: the `variantGroup` field of a container and of a created container, written in proposal `formatVersion` 14 only when it carries one. The review shows "Variant of: …" with the names of the other containers, or "No variants" (#2034).

## Alterado

- The project schema is v26: a v25 project opens migrated with nothing else changed, the original goes to `backups/` before the first write, and an earlier app opens the new file read-only (#2034).
