import {
  createDrawingCache,
  effectiveDensity,
  effectiveDirection,
  effectiveDrawingMode,
  projectIndex,
  projectIssues,
  SLOT_OVERFLOW,
  typeOfAnnotation,
  type ComponentDrawing,
  type DrawingCache,
  type DrawingSlotIssue,
  type Project,
} from '../src/model';
import { builtinFontBook, measurerFor, type FontBook } from './image/textMeasurer';
import type { Refs } from './items';

// Per-instance drawing proof (Faithful components stage, CF10, decision 27): the component of
// each marking created or changed by the batch is instantiated in the rectangle and with the real values,
// in the container's effective mode, and the engine's "does not fit" becomes a `component-overflow` item in
// `issues.new`. It is a warning: it does not block the batch. The warnings and the computations are the model's
// (`ComponentDrawing.shortfalls` and `slotIssues`); here we only choose what to prove and how to show it.

export const COMPONENT_OVERFLOW = 'component-overflow';

export interface OverflowItem {
  readonly code: typeof COMPONENT_OVERFLOW;
  /** `text` (text that does not fit the height), `content` (children that go past the frame) or `slot`. */
  readonly kind: 'text' | 'content' | 'slot';
  /** The component node that does not fit (its name in the template). */
  readonly node: string;
  /** How much is missing, in px (one decimal place). */
  readonly missing: number;
  /** Measured without the library's font: the bundled one in its place, only a signal to take a look. */
  readonly approximate?: true;
  readonly message: string;
}

const KIND_OF_PREFIX: readonly [string, OverflowItem['kind']][] = [
  ['text larger than the box', 'text'],
  ['content larger than the box', 'content'],
];

const json = (value: unknown) => JSON.stringify(value);

/** Equality by reference first: the most common case is the object not having changed, and `stringify` is expensive. */
const differs = (a: unknown, b: unknown) => a !== b && json(a) !== json(b);

/** One drawing cache per font reader: consecutive proofs of the same project reuse the instances. */
const drawingCaches = new WeakMap<FontBook, DrawingCache>();

/** The space changed what applies in it for the drawing: effective mode, density or reading direction. */
function spaceChanged(before: Project, after: Project, containerId: string | null) {
  return (
    effectiveDrawingMode(before, containerId) !==
      effectiveDrawingMode(after, containerId) ||
    effectiveDensity(before, containerId) !== effectiveDensity(after, containerId) ||
    effectiveDirection(before, containerId) !== effectiveDirection(after, containerId)
  );
}

/** Markings the batch created or changed (rectangle, annotation, mode, density, direction) and their owners. */
function touchedMarkings(before: Project, after: Project): Set<string> {
  const old = projectIndex(before);
  const next = projectIndex(after);
  const touched = new Set<string>();
  for (const marking of after.markings) {
    const previous = old.markings.get(marking.id);
    const changed =
      previous === undefined ||
      differs(previous, marking) ||
      spaceChanged(before, after, marking.containerId) ||
      annotationsChanged(old.annotations, next.annotationsByMarking, marking.id);
    if (changed) touched.add(marking.id);
  }
  addDependents(next, touched);
  return touched;
}

/**
 * Whoever depends on the drawing of the touched markings enters the proof: the follower (its drawing reads
 * the target through `$anchor.*`: side, center and size) and the owner (the child that changes may stop fitting
 * in its slot).
 */
function addDependents(
  next: ReturnType<typeof projectIndex>,
  touched: Set<string>,
): void {
  for (const id of [...touched]) {
    for (const follower of next.anchoredBy.get(id) ?? []) touched.add(follower.id);
  }
  for (const id of [...touched]) {
    const parent = next.markings.get(id)?.parentId;
    if (parent != null) touched.add(parent);
  }
}

type Annotations = ReturnType<typeof projectIndex>['annotations'];

function annotationsChanged(
  old: Annotations,
  byMarking: ReturnType<typeof projectIndex>['annotationsByMarking'],
  markingId: string,
): boolean {
  return (byMarking.get(markingId) ?? []).some((a) => differs(old.get(a.id), a));
}

function itemOf(message: string, missing: number, approximate: boolean): OverflowItem {
  const rounded = Math.round(missing * 10) / 10;
  const kind =
    message === SLOT_OVERFLOW || message.startsWith(`${SLOT_OVERFLOW} `)
      ? 'slot'
      : (KIND_OF_PREFIX.find(([prefix]) => message.startsWith(prefix))?.[1] ?? 'content');
  const node = message.includes(': ')
    ? message.slice(message.indexOf(': ') + 2)
    : message;
  const base = `${message} — ${rounded} px short`;
  return {
    code: COMPONENT_OVERFLOW,
    kind,
    node,
    missing: rounded,
    ...(approximate ? { approximate: true as const } : {}),
    message: approximate ? `${base} (approximate)` : base,
  };
}

function itemsOf(drawing: ComponentDrawing, approximate: boolean): OverflowItem[] {
  return Object.entries(drawing.shortfalls).map(([message, missing]) =>
    itemOf(message, missing, approximate),
  );
}

/** A child that its owner's slot does not accept or that goes past the slot's `max` (stage #1080, decision 10). */
export interface SlotItem {
  readonly code: DrawingSlotIssue['code'];
  readonly slot: { readonly id: string; readonly name: string };
  readonly owner: string;
  readonly max?: number;
  readonly message: string;
}

export type DrawingItem = OverflowItem | SlotItem;

/** The `slot-not-accepted` text carries the child's type; `slot-full` carries the slot's `max`. */
function slotItemOf(issue: DrawingSlotIssue, typeName: string): SlotItem {
  const where = `the slot ${issue.slot.name} of ${issue.owner}`;
  return {
    code: issue.code,
    slot: { id: issue.slot.id, name: issue.slot.name },
    owner: issue.owner,
    ...(issue.max === undefined ? {} : { max: issue.max }),
    message:
      issue.code === 'slot-full'
        ? `${where} takes ${issue.max ?? 0}`
        : `${where} does not accept ${typeName}`,
  };
}

/** The slot items of a drawing whose mother or child marking the batch touched, by the child's annotation. */
function slotItemsOf(
  drawing: ComponentDrawing,
  after: Project,
  touched: ReadonlySet<string> | null,
): [string, SlotItem][] {
  const index = projectIndex(after);
  const found: [string, SlotItem][] = [];
  for (const issue of drawing.slotIssues) {
    const child = index.annotations.get(issue.annotationId);
    if (!child) continue;
    if (
      touched !== null &&
      !touched.has(drawing.markingId) &&
      !touched.has(child.markingId)
    )
      continue;
    const typeName = typeOfAnnotation(after, child)?.type.name ?? '';
    found.push([issue.annotationId, slotItemOf(issue, typeName)]);
  }
  return found;
}

/** The drawing cache of the fonts that measure `refs`' project (the proof has no saved revision to memoize on). */
function drawingsOf(
  refs: Refs,
  project: Project = refs.project,
): ReturnType<DrawingCache> {
  const fonts = refs.loaded.fonts ?? builtinFontBook();
  // The project as it was before the batch is drawn once, in a cache of its own: in the saved project's it would
  // evict the entries that the next call reuses.
  let cache = project === refs.project ? drawingCaches.get(fonts) : createDrawingCache();
  if (cache === undefined) {
    cache = createDrawingCache();
    drawingCaches.set(fonts, cache);
  }
  return cache(project, refs.loaded.catalog, measurerFor(fonts), 0);
}

/**
 * The drawing items per annotation, of the markings the batch created or changed: `component-overflow` of the
 * touched markings and `slot-not-accepted` / `slot-full` of the drawings whose mother or child it touched.
 */
export function drawingProof(
  refs: Refs,
  before: Project,
): Map<string, readonly DrawingItem[]> {
  const touched = touchedMarkings(before, refs.project);
  if (touched.size === 0) return new Map();
  return drawingItemsOf(refs, refs.project, touched);
}

/**
 * The drawing items per annotation of `project`'s drawings; with `touched` only those of the touched
 * markings (and of the drawings whose mother or child it touched), without it all of them.
 */
function drawingItemsOf(
  refs: Refs,
  project: Project,
  touched: ReadonlySet<string> | null,
): Map<string, readonly DrawingItem[]> {
  const found = new Map<string, readonly DrawingItem[]>();
  const approximate = !(refs.loaded.fonts ?? builtinFontBook()).hasLibraryFonts;
  const add = (annotationId: string, items: readonly DrawingItem[]) =>
    found.set(annotationId, [...(found.get(annotationId) ?? []), ...items]);
  for (const drawing of drawingsOf(refs, project).values()) {
    if (drawing.overflow && (touched === null || touched.has(drawing.markingId))) {
      add(drawing.annotationId, itemsOf(drawing, approximate));
    }
    for (const [annotationId, item] of slotItemsOf(drawing, project, touched)) {
      add(annotationId, [item]);
    }
  }
  return found;
}

interface IssueEntry {
  readonly annotation: string;
  readonly issues: readonly object[];
}

/** What tells two drawing items of an annotation apart (the amount missing does not). */
const itemKey = (item: DrawingItem): string =>
  'slot' in item
    ? `${item.code}\u0000${item.slot.id}`
    : `${item.code}\u0000${item.kind}\u0000${item.node}`;

/**
 * The batch's `issues` with the drawing's items (does not fit, slot not accepted or full) added: `new` lists
 * only what the project did not already have before the batch, and `before`, `after` and `resolved` count the
 * annotations with a static pending item or a drawing item, so what was already there is not new.
 */
export function withDrawingIssues(
  issues: Record<string, unknown>,
  refs: Refs,
  before: Project,
): Record<string, unknown> {
  // The saved project is drawn first: drawing `before` ahead of it leaves its cache stale for a changed direction.
  const hasAfter = drawingItemsOf(refs, refs.project, null);
  const proof = drawingProof(refs, before);
  const hadBefore = drawingItemsOf(refs, before, null);
  const idsBefore = new Set([...projectIssues(before).keys(), ...hadBefore.keys()]);
  const idsAfter = new Set([...projectIssues(refs.project).keys(), ...hasAfter.keys()]);
  const counts = {
    before: idsBefore.size,
    after: idsAfter.size,
    resolved: [...idsBefore].filter((id) => !idsAfter.has(id)).length,
  };
  const entries = [...((issues.new as IssueEntry[] | undefined) ?? [])];
  for (const [annotationId, items] of proof) {
    const had = new Set((hadBefore.get(annotationId) ?? []).map(itemKey));
    const gained = items.filter((item) => !had.has(itemKey(item)));
    if (gained.length === 0) continue;
    const ref = refs.ref('a', annotationId);
    const at = entries.findIndex((e) => e.annotation === ref);
    if (at < 0) entries.push({ annotation: ref, issues: [...gained] });
    else entries[at] = { ...entries[at]!, issues: [...entries[at]!.issues, ...gained] };
  }
  return { ...issues, ...counts, new: entries };
}
