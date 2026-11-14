import { fail } from './errors';
import { updateById } from './project';
import type { Spec, SpecAnnotationType, SpecLayer, SpecTypeSource } from './spec';
import type { ExternalSource, Marking, Project, ProjectContainer } from './types';

// External identity (stage 4): `source` on containers and markings (schema v8) and `sources`
// on the types and fields of specializations (formatVersion 3). The core does not interpret
// `system` or the names: it only validates the structure and hands the data back to whoever asks.

/**
 * Normalizes and validates a source: `system` and `id` trimmed and non-empty;
 * an empty `url` becomes `null`. Throws `invalid-source` if `system` or `id` is missing.
 */
export function normalizeSource(source: ExternalSource | null): ExternalSource | null {
  if (source === null) return null;
  const system = source.system.trim();
  const id = source.id.trim();
  if (system === '' || id === '') fail('invalid-source');
  const url = source.url?.trim() ?? '';
  return { system, id, url: url === '' ? null : url };
}

/** Sets (or clears, with `null`) the container's source. Not geometry: the lock does not block it. */
export function setImageSource(
  p: Project,
  containerId: string,
  source: ExternalSource | null,
): Project {
  const normalized = normalizeSource(source);
  return {
    ...p,
    containers: updateById(p.containers, containerId, (i) => ({
      ...i,
      source: normalized,
    })),
  };
}

/** Sets (or clears, with `null`) the marking's source. Not geometry: the lock does not block it. */
export function setMarkingSource(
  p: Project,
  markingId: string,
  source: ExternalSource | null,
): Project {
  const normalized = normalizeSource(source);
  return {
    ...p,
    markings: updateById(p.markings, markingId, (m) => ({ ...m, source: normalized })),
  };
}

export type SourceMatch =
  | { readonly kind: 'image'; readonly image: ProjectContainer }
  | { readonly kind: 'marking'; readonly marking: Marking };

/**
 * Containers and markings whose source is `system` + `id` (exact comparison), containers
 * first, in project order. Normally there is at most one item, but the format does not
 * forbid repetitions (e.g. the same screen imported twice), so the list is returned.
 */
export function findBySource(p: Project, system: string, id: string): SourceMatch[] {
  const same = (s: ExternalSource | null) =>
    s !== null && s.system === system && s.id === id;
  return [
    ...p.containers
      .filter((image) => same(image.source))
      .map((image): SourceMatch => ({ kind: 'image', image })),
    ...p.markings
      .filter((marking) => same(marking.source))
      .map((marking): SourceMatch => ({ kind: 'marking', marking })),
  ];
}

/** What identifies the source element in the type search: `id`, `name` or both. */
export interface SourceQuery {
  readonly id?: string;
  readonly name?: string;
}

export interface TypeSourceMatch {
  /** Id of the specialization (`spec.id`). */
  readonly specId: string;
  readonly layer: SpecLayer;
  readonly type: SpecAnnotationType;
  /** The `sources` declaration that matched. */
  readonly source: SpecTypeSource;
  /** Matched by `id` (stronger) or only by `name`. */
  readonly by: 'id' | 'name';
  /**
   * The `system` is declared in the specialization's `origins`: the `sources` of its fields
   * carry `path` (the path of the value in the external node's props) instead of just `name`.
   */
  readonly executable: boolean;
}

/** `true` if `system` is an executable source of the specialization (it is in `origins`). */
export function isExecutableSystem(spec: Spec | null, system: string): boolean {
  return spec?.origins?.some((o) => o.system === system) ?? false;
}

/**
 * Annotation types that match a source element: same `system` and the same `id` or the same
 * `name` (exact comparisons). Those that match by `id` come before those that match only by
 * `name`; within each group, the order of the specializations, layers and types. A type
 * appears once (with the best declaration). Without `id` or `name` in the query, the list is
 * empty. It never matches by `path` (a field's path): only `executable` says whether the
 * type's fields carry it.
 */
export function findTypesBySource(
  specs: readonly (Spec | null)[],
  system: string,
  query: SourceQuery,
): TypeSourceMatch[] {
  if (query.id === undefined && query.name === undefined) return [];
  const byId: TypeSourceMatch[] = [];
  const byName: TypeSourceMatch[] = [];
  for (const spec of specs) {
    if (!spec) continue;
    const executable = isExecutableSystem(spec, system);
    for (const layer of spec.layers) {
      for (const type of layer.annotationTypes) {
        const sources = (type.sources ?? []).filter((s) => s.system === system);
        const idMatch =
          query.id !== undefined ? sources.find((s) => s.id === query.id) : undefined;
        if (idMatch) {
          byId.push({
            specId: spec.id,
            layer,
            type,
            source: idMatch,
            by: 'id',
            executable,
          });
          continue;
        }
        const nameMatch =
          query.name !== undefined
            ? sources.find((s) => s.name === query.name)
            : undefined;
        if (nameMatch) {
          byName.push({
            specId: spec.id,
            layer,
            type,
            source: nameMatch,
            by: 'name',
            executable,
          });
        }
      }
    }
  }
  return [...byId, ...byName];
}
