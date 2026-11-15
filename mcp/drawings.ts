import {
  createDrawingCache,
  projectIssues,
  type AnnotationIssue,
  type ComponentDrawings,
} from '../src/model';
import { builtinFontBook, measurerFor } from './image/textMeasurer';
import { drawingKeyOfLoaded, type LoadedProject } from './projects';

// One plumbing (stage #1080, SL4, decision 7): the drawing cache feeds the app (`src/store/derived.ts`) and the
// MCP reads (views, lists, counts) alike. Here the drawings of a loaded project are instantiated once per
// content key (revision, specializations, component texts and fonts: `LoadedProject.drawingKey`), because each
// call reloads the project and its `catalog` and `fonts` are new objects: identity would never hit.

interface Entry {
  readonly key: string;
  readonly drawings: ComponentDrawings;
  /** The model's issues plus the drawing's, built on first use. */
  issues?: ReadonlyMap<string, readonly AnnotationIssue[]>;
}

/** How many projects the memo keeps (the oldest one leaves first). */
const MAX_ENTRIES = 4;
const entries = new Map<string, Entry>();
/** A project without a valid key (P3): one entry per loaded object, so a list does not instantiate per row. */
const unkeyed = new WeakMap<LoadedProject, Entry>();

function instantiate(loaded: LoadedProject): ComponentDrawings {
  const fonts = loaded.fonts ?? builtinFontBook();
  return createDrawingCache()(loaded.project, loaded.catalog, measurerFor(fonts), 0);
}

function entryOf(loaded: LoadedProject): Entry {
  const key = drawingKeyOfLoaded(loaded);
  if (key === undefined) {
    const own = unkeyed.get(loaded) ?? { key: '', drawings: instantiate(loaded) };
    unkeyed.set(loaded, own);
    return own;
  }
  const dir = loaded.location.dir;
  const hit = entries.get(dir);
  if (hit !== undefined && hit.key === key) {
    entries.delete(dir);
    entries.set(dir, hit);
    return hit;
  }
  const entry: Entry = { key, drawings: instantiate(loaded) };
  entries.delete(dir);
  entries.set(dir, entry);
  if (entries.size > MAX_ENTRIES) entries.delete(entries.keys().next().value!);
  return entry;
}

/** The drawings of the project's component markings (memoized by content). */
export function projectDrawings(loaded: LoadedProject): ComponentDrawings {
  return entryOf(loaded).drawings;
}

function mergeDrawingIssues(
  base: ReadonlyMap<string, readonly AnnotationIssue[]>,
  drawings: ComponentDrawings,
): ReadonlyMap<string, readonly AnnotationIssue[]> {
  let merged: Map<string, readonly AnnotationIssue[]> | undefined;
  const add = (annotationId: string, issue: AnnotationIssue) => {
    merged ??= new Map(base);
    merged.set(annotationId, [...(merged.get(annotationId) ?? []), issue]);
  };
  for (const d of drawings.values()) {
    if (d.overflow) add(d.annotationId, { code: 'component-overflow' });
    for (const { annotationId, ...issue } of d.slotIssues) add(annotationId, issue);
  }
  return merged ?? base;
}

/**
 * The pending items of every annotation: the model's (`projectIssues`) plus the drawing's
 * (`component-overflow`, `slot-not-accepted`, `slot-full`), in the same shape and order as `derived.issues`.
 * It is the model's own map when no drawing has anything.
 */
export function projectIssuesWithDrawings(
  loaded: LoadedProject,
): ReadonlyMap<string, readonly AnnotationIssue[]> {
  const entry = entryOf(loaded);
  if (entry.issues !== undefined) return entry.issues;
  const issues = mergeDrawingIssues(projectIssues(loaded.project), entry.drawings);
  entry.issues = issues;
  return issues;
}
