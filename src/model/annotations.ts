import { fail } from './errors';
import { validateEntries } from './invariants';
import { findById, moveItem, normalizeOptionalName, updateById } from './project';
import type { Annotation, Entry, Layer, Project } from './types';

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

/**
 * Camadas com ao menos uma anotação, por marcação, considerando só `layers`
 * (as camadas visíveis). Cada lista segue a ordem de `layers`; marcações sem
 * anotação nessas camadas não aparecem no mapa.
 */
export function annotatedLayersByMarking(
  p: Project,
  layers: readonly Layer[],
): Map<string, Layer[]> {
  const order = new Map(layers.map((l, i) => [l.id, i]));
  const found = new Map<string, Set<number>>();
  for (const a of p.annotations) {
    const index = order.get(a.layerId);
    if (index === undefined) continue;
    const set = found.get(a.markingId) ?? new Set<number>();
    set.add(index);
    found.set(a.markingId, set);
  }
  const result = new Map<string, Layer[]>();
  for (const [markingId, indexes] of found) {
    result.set(
      markingId,
      [...indexes].sort((a, b) => a - b).map((i) => layers[i] as Layer),
    );
  }
  return result;
}

/** Anotações da marcação na camada, na ordem de exibição. */
export function annotationsOf(
  p: Project,
  markingId: string,
  layerId: string,
): Annotation[] {
  return p.annotations.filter((a) => a.markingId === markingId && a.layerId === layerId);
}
