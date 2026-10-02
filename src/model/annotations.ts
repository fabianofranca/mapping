import { fail } from './errors';
import { validateEntries } from './invariants';
import { annotationWithLinked } from './links';
import { findById, moveItem, normalizeOptionalName, updateById } from './project';
import { countBrokenRefs } from './refs';
import type { Annotation, Entry, Layer, Project } from './types';

/** Par a gravar; sem `id`, ganha um novo (`crypto.randomUUID()`). */
export interface EntryInput {
  readonly id?: string;
  readonly key: string;
  readonly value: string;
}

/** Valida e normaliza os pares (chaves sem espaços nas pontas; todo par com `id`). */
function checkEntries(entries: readonly EntryInput[]): Entry[] {
  const normalized = entries.map((e) => ({
    id: e.id ?? crypto.randomUUID(),
    key: e.key.trim(),
    value: e.value,
  }));
  const issue = validateEntries(normalized).find((i) => i !== null);
  if (issue) fail(issue);
  if (new Set(normalized.map((e) => e.id)).size !== normalized.length) {
    fail('duplicate-id');
  }
  return normalized;
}

export interface NewAnnotationArgs {
  readonly id: string;
  readonly markingId: string;
  readonly layerId: string;
  readonly name?: string | null;
  readonly entries?: readonly EntryInput[];
}

/** Cria uma anotação livre. Camadas de especialização só aceitam tipadas (`addTypedAnnotation`). */
export function addAnnotation(p: Project, args: NewAnnotationArgs): Project {
  findById(p.markings, args.markingId);
  const layer = findById(p.layers, args.layerId);
  if (layer.spec) fail('typed-layer', layer.id);
  const annotation: Annotation = {
    id: args.id,
    markingId: args.markingId,
    layerId: args.layerId,
    name: normalizeOptionalName(args.name ?? null),
    inherit: false,
    parentAnnotationId: null,
    type: null,
    values: null,
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

/** Exclui a anotação e, em cascata, as vinculadas a ela (recursivamente). */
export function removeAnnotation(p: Project, annotationId: string): Project {
  findById(p.annotations, annotationId);
  const doomed = annotationWithLinked(p, annotationId);
  return { ...p, annotations: p.annotations.filter((a) => !doomed.has(a.id)) };
}

/**
 * Quantas anotações saem junto na exclusão (inclui a própria) e quantas
 * referências de outras anotações vão quebrar.
 */
export function annotationDeletionImpact(
  p: Project,
  annotationId: string,
): { annotations: number; brokenRefs: number } {
  findById(p.annotations, annotationId);
  return {
    annotations: annotationWithLinked(p, annotationId).size,
    brokenRefs: countBrokenRefs(p, removeAnnotation(p, annotationId)),
  };
}

function updateEntries(
  p: Project,
  annotationId: string,
  update: (entries: readonly Entry[]) => readonly EntryInput[],
): Project {
  return {
    ...p,
    annotations: updateById(p.annotations, annotationId, (a) => {
      if (a.type) fail('typed-annotation', a.id);
      return { ...a, entries: checkEntries(update(a.entries)) };
    }),
  };
}

function entryIndex(entries: readonly Entry[], entryId: string): number {
  const index = entries.findIndex((e) => e.id === entryId);
  if (index < 0) fail('not-found', entryId);
  return index;
}

/** Substitui todos os pares de uma vez (pares com `id` mantêm a identidade). */
export function setEntries(
  p: Project,
  annotationId: string,
  entries: readonly EntryInput[],
): Project {
  return updateEntries(p, annotationId, () => entries);
}

export function addEntry(p: Project, annotationId: string, entry: EntryInput): Project {
  return updateEntries(p, annotationId, (entries) => [...entries, entry]);
}

/** Altera chave e valor do par; o `id` continua o mesmo (as referências seguem valendo). */
export function updateEntry(
  p: Project,
  annotationId: string,
  entryId: string,
  entry: { readonly key: string; readonly value: string },
): Project {
  return updateEntries(p, annotationId, (entries) => {
    entryIndex(entries, entryId);
    return entries.map((e) =>
      e.id === entryId ? { id: e.id, key: entry.key, value: entry.value } : e,
    );
  });
}

export function removeEntry(p: Project, annotationId: string, entryId: string): Project {
  return updateEntries(p, annotationId, (entries) => {
    entryIndex(entries, entryId);
    return entries.filter((e) => e.id !== entryId);
  });
}

/** Move o par para a posição `to` (índice final na lista). */
export function moveEntry(
  p: Project,
  annotationId: string,
  entryId: string,
  to: number,
): Project {
  return updateEntries(p, annotationId, (entries) =>
    moveItem(entries, entryIndex(entries, entryId), to),
  );
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
