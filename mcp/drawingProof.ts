import {
  createDrawingCache,
  effectiveDensity,
  effectiveDirection,
  effectiveDrawingMode,
  projectIndex,
  SLOT_OVERFLOW,
  type ComponentDrawing,
  type DrawingCache,
  type Project,
} from '../src/model';
import { builtinFontBook, measurerFor, type FontBook } from './image/textMeasurer';
import type { Refs } from './items';

// Per-instance drawing proof (Faithful components stage, CF10, decision 27): the component of
// each marking created or changed by the batch is instantiated in the rectangle and with the real values,
// in the container's effective mode, and the engine's "does not fit" becomes a `component-overflow` item in
// `issues.new`. It is a warning: it does not block the batch. The warnings and the computations are the model's
// (`ComponentDrawing.shortfalls`); here we only choose what to prove and how to show it.

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
    message === SLOT_OVERFLOW
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

/** The `component-overflow` items per annotation, of the markings the batch created or changed. */
export function overflowProof(
  refs: Refs,
  before: Project,
): Map<string, readonly OverflowItem[]> {
  const after = refs.project;
  const found = new Map<string, readonly OverflowItem[]>();
  const touched = touchedMarkings(before, after);
  if (touched.size === 0) return found;
  const fonts = refs.loaded.fonts ?? builtinFontBook();
  const approximate = !fonts.hasLibraryFonts;
  let cache = drawingCaches.get(fonts);
  if (cache === undefined) {
    cache = createDrawingCache();
    drawingCaches.set(fonts, cache);
  }
  const drawings = cache(after, refs.loaded.catalog, measurerFor(fonts), 0);
  for (const drawing of drawings.values()) {
    if (!drawing.overflow || !touched.has(drawing.markingId)) continue;
    found.set(drawing.annotationId, itemsOf(drawing, approximate));
  }
  return found;
}

interface IssueEntry {
  readonly annotation: string;
  readonly issues: readonly object[];
}

/** The batch's `issues` with the "does not fit" of the proven markings added to `issues.new`. */
export function withOverflow(
  issues: Record<string, unknown>,
  refs: Refs,
  before: Project,
): Record<string, unknown> {
  const proof = overflowProof(refs, before);
  if (proof.size === 0) return issues;
  const entries = [...((issues.new as IssueEntry[] | undefined) ?? [])];
  for (const [annotationId, items] of proof) {
    const ref = refs.ref('a', annotationId);
    const at = entries.findIndex((e) => e.annotation === ref);
    if (at < 0) entries.push({ annotation: ref, issues: [...items] });
    else entries[at] = { ...entries[at]!, issues: [...entries[at]!.issues, ...items] };
  }
  return { ...issues, new: entries };
}
