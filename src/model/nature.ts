import type { Annotation, Project, ProjectSpecialization } from './types';

// The nature of a marking (stage #3087, decision 1): a marking whose own annotation has a type that
// declares `component` is **materialized**; every other one is an **observation** marking. Only the
// applied specialization decides: no component catalog, no files, so the pure settle can read it.
// Floating and decorative are flags on top of the nature. Pure.

export type Nature = 'materialized' | 'observation';

const NO_IDS: ReadonlySet<string> = new Set();

/** Keys (`specId`, `typeId`) of the types that declare a component, per applied specializations. */
const typeSets = new WeakMap<readonly ProjectSpecialization[], ReadonlySet<string>>();

/** Materialized ids, per annotation list and the specializations it was read with. */
const idSets = new WeakMap<
  readonly Annotation[],
  { readonly specs: readonly ProjectSpecialization[]; readonly ids: ReadonlySet<string> }
>();

const keyOf = (specId: string, typeId: string): string => `${specId}\u0000${typeId}`;

/** The component types of the applied specializations (the first type of an id wins, as in the index). */
function componentTypes(specs: readonly ProjectSpecialization[]): ReadonlySet<string> {
  const cached = typeSets.get(specs);
  if (cached) return cached;
  const seen = new Set<string>();
  const out = new Set<string>();
  for (const s of specs) {
    if (!s.spec) continue;
    for (const layer of s.spec.layers) {
      for (const type of layer.annotationTypes) {
        const key = keyOf(s.id, type.id);
        if (seen.has(key)) continue;
        seen.add(key);
        if (type.component !== undefined) out.add(key);
      }
    }
  }
  typeSets.set(specs, out);
  return out;
}

/**
 * The ids of the materialized markings: an own, typed annotation whose type declares a component.
 * Memoized by the annotation list and the specializations, so every project that shares both (a
 * geometry operation, a settle) shares the answer, and the clipped settle recomputes it only after an
 * operation that touched an annotation or a specialization. Never changes while `ids` is read.
 */
export function materializedIds(p: Project): ReadonlySet<string> {
  const hit = idSets.get(p.annotations);
  if (hit && hit.specs === p.specializations) return hit.ids;
  const types = componentTypes(p.specializations);
  let ids: Set<string> | null = null;
  if (types.size > 0) {
    for (const a of p.annotations) {
      if (a.type === null || a.values === null) continue;
      if (!types.has(keyOf(a.type.specId, a.type.typeId))) continue;
      (ids ??= new Set()).add(a.markingId);
    }
  }
  const out = ids ?? NO_IDS;
  idSets.set(p.annotations, { specs: p.specializations, ids: out });
  return out;
}

/** The nature of the marking; an id that is not a marking is an observation one. */
export function natureOf(p: Project, markingId: string): Nature {
  return materializedIds(p).has(markingId) ? 'materialized' : 'observation';
}

/**
 * The ids whose nature differs between `before` and `next` (delta form for the clipped settle): empty
 * for an operation that touched neither the annotations nor the specializations, which costs nothing.
 */
export function natureChanges(before: Project, next: Project): ReadonlySet<string> {
  if (
    before.annotations === next.annotations &&
    before.specializations === next.specializations
  ) {
    return NO_IDS;
  }
  const was = materializedIds(before);
  const now = materializedIds(next);
  if (was === now || (was.size === 0 && now.size === 0)) return NO_IDS;
  const out = new Set<string>();
  for (const id of was) if (!now.has(id)) out.add(id);
  for (const id of now) if (!was.has(id)) out.add(id);
  return out;
}
