import {
  effectiveContainerClasses,
  missingVariantTypes,
  projectIndex,
  typeKey,
  variantsOf,
  type ProjectContainer,
} from '../src/model';
import type { Refs } from './items';

// Reads of the variants of a screen (stage #2034, decision 11): `get_container` returns `variants` and
// `missingTypes`; `get_project` lists `variants` (references) only on the containers that have them.

type Json = Record<string, unknown>;

/** The other containers of the group: reference, name, page and the classes each one has. */
export function variantRows(refs: Refs, container: ProjectContainer): Json[] {
  const p = refs.project;
  return variantsOf(p, container.id).map((v) => {
    const page = p.pages.find((g) => g.id === v.pageId);
    return {
      ref: refs.ref('i', v.id),
      name: v.name,
      page: page ? { id: page.id, name: page.name } : null,
      effectiveClasses: effectiveContainerClasses(p, v.id),
    };
  });
}

/** The annotation types the other variants map and this container does not (a hint, not a pending item). */
export function missingTypeRows(refs: Refs, container: ProjectContainer): Json[] {
  const p = refs.project;
  const index = projectIndex(p);
  return missingVariantTypes(p, container.id).map((m) => ({
    type: `${m.type.specId}/${m.type.typeId}`,
    name: index.types.get(typeKey(m.type.specId, m.type.typeId))?.type.name ?? m.type.typeId,
    variants: m.variants.map((id) => refs.ref('i', id)),
  }));
}

/** `variants: [ref…]` of the container, or nothing when it has none (keeps `get_project` short). */
export function variantRefs(refs: Refs, container: ProjectContainer): Json {
  const variants = variantsOf(refs.project, container.id);
  return variants.length === 0
    ? {}
    : { variants: variants.map((v) => refs.ref('i', v.id)) };
}
