import { fail } from './errors';
import {
  APP_ID,
  COORDINATE_SYSTEM,
  SCHEMA_VERSION,
  type Layer,
  type Project,
} from './types';

export interface NewProjectArgs {
  readonly name: string;
  /** Data ISO 8601 usada em `createdAt` e `updatedAt`. */
  readonly now: string;
  /** Camada inicial ("Camada 1" / "Layer 1", conforme o idioma). Sempre livre. */
  readonly firstLayer: Omit<Layer, 'spec'>;
}

export function createProject({ name, now, firstLayer }: NewProjectArgs): Project {
  return {
    schemaVersion: SCHEMA_VERSION,
    revision: 0,
    app: APP_ID,
    coordinateSystem: COORDINATE_SYSTEM,
    project: { name: name.trim(), createdAt: now, updatedAt: now },
    specializations: [],
    layers: [{ ...firstLayer, spec: null }],
    images: [],
    markings: [],
    annotations: [],
  };
}

export function renameProject(p: Project, name: string): Project {
  const trimmed = name.trim();
  if (trimmed === '') fail('invalid-name');
  return { ...p, project: { ...p.project, name: trimmed } };
}

/** Atualiza `updatedAt`. Chamado pelo store a cada alteração. */
export function touchProject(p: Project, now: string): Project {
  return { ...p, project: { ...p.project, updatedAt: now } };
}

/** Nome sem espaços nas pontas; vazio vira `null`. */
export function normalizeOptionalName(name: string | null): string | null {
  const trimmed = name?.trim() ?? '';
  return trimmed === '' ? null : trimmed;
}

/** Substitui o item de id `id` pelo resultado de `update`. Falha se o id não existir. */
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

/** Move o item de `from` para `to` numa lista (ordem = ordem de exibição). */
export function moveItem<T>(list: readonly T[], from: number, to: number): T[] {
  if (!Number.isInteger(from) || from < 0 || from >= list.length) fail('invalid-index');
  if (!Number.isInteger(to) || to < 0 || to >= list.length) fail('invalid-index');
  const result = [...list];
  const [item] = result.splice(from, 1);
  result.splice(to, 0, item as T);
  return result;
}
