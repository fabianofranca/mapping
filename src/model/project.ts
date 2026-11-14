import { fail } from './errors';
import {
  APP_ID,
  COORDINATE_SYSTEM,
  SCHEMA_VERSION,
  type Layer,
  type Project,
} from './types';

export interface NewProjectArgs {
  /** Project identity (UUID). Default: a new one; a deterministic generator passes a fixed one. */
  readonly id?: string;
  readonly name: string;
  /** ISO 8601 date used in `createdAt` and `updatedAt`. */
  readonly now: string;
  /** Initial layer ("Camada 1" / "Layer 1", depending on the language). Always free. */
  readonly firstLayer: Omit<Layer, 'spec'>;
}

export function createProject({
  id = crypto.randomUUID(),
  name,
  now,
  firstLayer,
}: NewProjectArgs): Project {
  const trimmed = name.trim();
  if (trimmed === '') fail('invalid-name');
  return {
    schemaVersion: SCHEMA_VERSION,
    revision: 0,
    app: APP_ID,
    coordinateSystem: COORDINATE_SYSTEM,
    project: { id, name: trimmed, createdAt: now, updatedAt: now },
    specializations: [],
    platformRepos: {},
    docRepos: {},
    layers: [{ ...firstLayer, spec: null }],
    containers: [],
    markings: [],
    arrows: [],
    perspectives: [],
    arrivals: [],
    annotations: [],
  };
}

export function renameProject(p: Project, name: string): Project {
  const trimmed = name.trim();
  if (trimmed === '') fail('invalid-name');
  return { ...p, project: { ...p.project, name: trimmed } };
}

/** Updates `updatedAt`. Called by the store on every change. */
export function touchProject(p: Project, now: string): Project {
  return { ...p, project: { ...p.project, updatedAt: now } };
}

/** Name without surrounding spaces; empty becomes `null`. */
export function normalizeOptionalName(name: string | null): string | null {
  const trimmed = name?.trim() ?? '';
  return trimmed === '' ? null : trimmed;
}

/** Replaces the item with id `id` by the result of `update`. Fails if the id does not exist. */
export function updateById<T extends { readonly id: string }>(
  list: readonly T[],
  id: string,
  update: (item: T) => T,
): T[] {
  let found = false;
  const result = list.map((item) => {
    if (item.id !== id) return item;
    found = true;
    return update(item);
  });
  if (!found) fail('not-found', id);
  return result;
}

export function findById<T extends { readonly id: string }>(
  list: readonly T[],
  id: string,
): T {
  return list.find((item) => item.id === id) ?? fail('not-found', id);
}

/** Moves the item from `from` to `to` in a list (order = display order). */
export function moveItem<T>(list: readonly T[], from: number, to: number): T[] {
  if (!Number.isInteger(from) || from < 0 || from >= list.length) fail('invalid-index');
  if (!Number.isInteger(to) || to < 0 || to >= list.length) fail('invalid-index');
  const result = [...list];
  const [item] = result.splice(from, 1);
  result.splice(to, 0, item as T);
  return result;
}
