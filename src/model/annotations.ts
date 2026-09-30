import { fail } from './errors';
import { validateEntries } from './invariants';
import { findById, moveItem, normalizeOptionalName, updateById } from './project';
import type { Annotation, Entry, Project } from './types';

/** Valida e normaliza os pares (chaves sem espaços nas pontas). */
function checkEntries(entries: readonly Entry[]): Entry[] {
  const normalized = entries.map((e) => ({ key: e.key.trim(), value: e.value }));
  const issue = validateEntries(normalized).find((i) => i !== null);
  if (issue) fail(issue);
  return normalized;
}

export interface NewAnnotationArgs {
  readonly id: string;
  readonly markingId: string;
  readonly layerId: string;
  readonly name?: string | null;
  readonly entries?: readonly Entry[];
}

export function addAnnotation(p: Project, args: NewAnnotationArgs): Project {
  findById(p.markings, args.markingId);
  findById(p.layers, args.layerId);
  const annotation: Annotation = {
    id: args.id,
    markingId: args.markingId,
    layerId: args.layerId,
    name: normalizeOptionalName(args.name ?? null),
    entries: checkEntries(args.entries ?? []),
  };
  return { ...p, annotations: [...p.annotations, annotation] };
}

export function renameAnnotation(
  p: Project,
  annotationId: string,
  name: string | null,
): Project {
  const normalized = normalizeOptionalName(name);
  return {
    ...p,
    annotations: updateById(p.annotations, annotationId, (a) => ({
      ...a,
      name: normalized,
    })),
  };
}

/** Exclusão simples (sem cascata): o undo cobre. */
export function removeAnnotation(p: Project, annotationId: string): Project {
  findById(p.annotations, annotationId);
  return { ...p, annotations: p.annotations.filter((a) => a.id !== annotationId) };
}

function updateEntries(
  p: Project,
  annotationId: string,
  update: (entries: readonly Entry[]) => readonly Entry[],
): Project {
  return {
    ...p,
    annotations: updateById(p.annotations, annotationId, (a) => ({
      ...a,
      entries: checkEntries(update(a.entries)),
    })),
  };
}

function checkIndex(entries: readonly Entry[], index: number): void {
  if (!Number.isInteger(index) || index < 0 || index >= entries.length)
    fail('invalid-index');
}

/** Substitui todos os pares de uma vez. */
export function setEntries(
  p: Project,
  annotationId: string,
  entries: readonly Entry[],
): Project {
  return updateEntries(p, annotationId, () => entries);
}

export function addEntry(p: Project, annotationId: string, entry: Entry): Project {
  return updateEntries(p, annotationId, (entries) => [...entries, entry]);
}

export function updateEntry(
  p: Project,
  annotationId: string,
  index: number,
  entry: Entry,
): Project {
  return updateEntries(p, annotationId, (entries) => {
    checkIndex(entries, index);
    return entries.map((e, i) => (i === index ? entry : e));
  });
}

export function removeEntry(p: Project, annotationId: string, index: number): Project {
  return updateEntries(p, annotationId, (entries) => {
    checkIndex(entries, index);
    return entries.filter((_, i) => i !== index);
  });
}

export function moveEntry(
  p: Project,
  annotationId: string,
  from: number,
  to: number,
): Project {
  return updateEntries(p, annotationId, (entries) => moveItem(entries, from, to));
}
