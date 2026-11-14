import { requireAnnotationOwner } from './arrows';
import { fail } from './errors';
import { validateEntries } from './invariants';
import { annotationWithLinked } from './links';
import { findById, moveItem, normalizeOptionalName, updateById } from './project';
import { projectIndex } from './projectIndex';
import { countBrokenRefs } from './refs';
import type { Annotation, Entry, Project } from './types';

/** Entry to save; without `id`, it gets a new one (`crypto.randomUUID()`). */
export interface EntryInput {
  readonly id?: string;
  readonly key: string;
  readonly value: string;
}

/**
 * Validates and normalizes the entries (keys without surrounding spaces; every entry with an
 * `id`). The entry's `id` is unique across the whole project: it cannot repeat that of an
 * entry of another annotation.
 */
function checkEntries(
  p: Project,
  annotationId: string,
  entries: readonly EntryInput[],
): Entry[] {
  const normalized = entries.map((e) => ({
    id: e.id ?? crypto.randomUUID(),
    key: e.key.trim(),
    value: e.value,
  }));
  const issue = validateEntries(normalized).find((i) => i !== null);
  if (issue) fail(issue);
  const ids = new Set(normalized.map((e) => e.id));
  if (ids.size !== normalized.length) fail('duplicate-id');
  for (const a of p.annotations) {
    if (a.id === annotationId) continue;
    const taken = a.entries.find((e) => ids.has(e.id));
    if (taken) fail('duplicate-id', taken.id);
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

/**
 * Creates a free annotation on the marking or the arrow (`markingId`: the ids share the space).
 * Specialization layers only accept typed ones (`addTypedAnnotation`).
 */
export function addAnnotation(p: Project, args: NewAnnotationArgs): Project {
  if (p.annotations.some((a) => a.id === args.id)) fail('duplicate-id', args.id);
  requireAnnotationOwner(p, args.markingId);
  const layer = findById(p.layers, args.layerId);
  if (layer.spec) fail('typed-layer', layer.id);
  const annotation: Annotation = {
    id: args.id,
    markingId: args.markingId,
    layerId: args.layerId,
    name: normalizeOptionalName(args.name ?? null),
    parentAnnotationId: null,
    parentRole: null,
    type: null,
    values: null,
    entries: checkEntries(p, args.id, args.entries ?? []),
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

/** Deletes the annotation and, in cascade, those linked to it (recursively). */
export function removeAnnotation(p: Project, annotationId: string): Project {
  findById(p.annotations, annotationId);
  const doomed = annotationWithLinked(p, annotationId);
  return { ...p, annotations: p.annotations.filter((a) => !doomed.has(a.id)) };
}

/**
 * How many annotations go along with the deletion (including itself) and how many
 * references from other annotations will break.
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
      return { ...a, entries: checkEntries(p, a.id, update(a.entries)) };
    }),
  };
}

function entryIndex(entries: readonly Entry[], entryId: string): number {
  const index = entries.findIndex((e) => e.id === entryId);
  if (index < 0) fail('not-found', entryId);
  return index;
}

/** Replaces all entries at once (entries with `id` keep their identity). */
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

/** Changes the entry's key and value; the `id` stays the same (references remain valid). */
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

/** Moves the entry to position `to` (final index in the list). */
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

/** The marking's annotations in the layer, in display order. */
export function annotationsOf(
  p: Project,
  markingId: string,
  layerId: string,
): Annotation[] {
  return (projectIndex(p).annotationsByMarking.get(markingId) ?? []).filter(
    (a) => a.layerId === layerId,
  );
}
