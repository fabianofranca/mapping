import {
  accessibilityAudit,
  type AccessibilityAudit,
  type AuditFinding,
  createDrawingCache,
  effectiveDensity,
  effectiveDirection,
  effectiveDrawingMode,
  projectIndex,
  projectIssues,
  SLOT_OVERFLOW,
  typeOfAnnotation,
  type AnnotationIssue,
  type ComponentDrawing,
  type ComponentDrawings,
  type DrawingCache,
  type DrawingSlotIssue,
  type Project,
} from '../src/model';
import { builtinFontBook, measurerFor, type FontBook } from './image/textMeasurer';
import { auditWarning } from './auditViews';
import type { Refs } from './items';
import { issueView } from './views';

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

/** Markings the batch created or changed (rectangle, annotation, mode, density, direction). */
function changedMarkings(before: Project, after: Project): Set<string> {
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
  return touched;
}

/** The changed markings and whoever depends on their drawing (their followers and owners). */
function touchedMarkings(before: Project, after: Project): Set<string> {
  const touched = changedMarkings(before, after);
  addDependents(projectIndex(after), touched);
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

function slotMessage(issue: DrawingSlotIssue, where: string, typeName: string): string {
  if (issue.code === 'slot-full') return `${where} takes ${issue.max ?? 0}`;
  if (issue.code === 'slot-hidden') return `${where} is hidden`;
  return `${where} does not accept ${typeName}`;
}

/** The `slot-not-accepted` text carries the child's type; `slot-full` carries the slot's `max`. */
function slotItemOf(issue: DrawingSlotIssue, typeName: string): SlotItem {
  const where = `the slot ${issue.slot.name} of ${issue.owner}`;
  return {
    code: issue.code,
    slot: { id: issue.slot.id, name: issue.slot.name },
    owner: issue.owner,
    ...(issue.max === undefined ? {} : { max: issue.max }),
    message: slotMessage(issue, where, typeName),
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
  drawingsAfter: ComponentDrawings = drawingsOf(refs, refs.project),
): Map<string, readonly DrawingItem[]> {
  const touched = touchedMarkings(before, refs.project);
  if (touched.size === 0) return new Map();
  return drawingItemsOf(refs, refs.project, touched, drawingsAfter);
}

/**
 * The drawing items per annotation of `project`'s drawings; with `touched` only those of the touched
 * markings (and of the drawings whose mother or child it touched), without it all of them.
 */
function drawingItemsOf(
  refs: Refs,
  project: Project,
  touched: ReadonlySet<string> | null,
  drawings: ComponentDrawings,
): Map<string, readonly DrawingItem[]> {
  const found = new Map<string, readonly DrawingItem[]>();
  const approximate = !(refs.loaded.fonts ?? builtinFontBook()).hasLibraryFonts;
  const add = (annotationId: string, items: readonly DrawingItem[]) =>
    found.set(annotationId, [...(found.get(annotationId) ?? []), ...items]);
  for (const drawing of drawings.values()) {
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

/** What tells two accessibility items of an annotation apart: the field, the part and the table cell. */
const auditKey = (i: AnnotationIssue): string =>
  [i.code, i.key, i.column, i.rowId, i.part?.id].map((x) => x ?? '').join('\u0000');

/** The accessibility audit of the project before and after a batch: each one is computed once per batch. */
export interface BatchAudits {
  readonly before: AccessibilityAudit;
  readonly after: AccessibilityAudit;
  /** The drawings the audits measured, shared with the drawing items: the batch draws each project once. */
  readonly drawingsBefore: ComponentDrawings;
  readonly drawingsAfter: ComponentDrawings;
}

/** The audit of `before` and of the saved project, with the drawings that measure each (one audit per project). */
export function batchAudits(refs: Refs, before: Project): BatchAudits {
  // The saved project is drawn first: drawing `before` ahead of it leaves its cache stale for a changed direction.
  const drawingsAfter = drawingsOf(refs, refs.project);
  const drawingsBefore = drawingsOf(refs, before);
  return {
    after: accessibilityAudit(refs.project, { drawings: drawingsAfter }),
    before: accessibilityAudit(before, { drawings: drawingsBefore }),
    drawingsBefore,
    drawingsAfter,
  };
}

/** The accessibility audit's pending items, by annotation. */
function auditIssuesOf(
  audit: AccessibilityAudit,
): Map<string, readonly AnnotationIssue[]> {
  const found = new Map<string, readonly AnnotationIssue[]>();
  for (const [annotationId, entry] of audit) {
    if (entry.issues.length > 0) found.set(annotationId, entry.issues);
  }
  return found;
}

/**
 * A touch finding is news when the annotation had none before, or when the batch made it worse: a smaller
 * `actual` (a side) or a larger `min`. An unchanged or better one is not repeated.
 */
export function worsened(before: AuditFinding | undefined, after: AuditFinding): boolean {
  if (before === undefined) return true;
  return (
    after.actual.width < before.actual.width ||
    after.actual.height < before.actual.height ||
    after.min.width > before.min.width ||
    after.min.height > before.min.height
  );
}

/**
 * The `touch-target-small` warnings of the markings the batch created or changed (stage #1128, decision 9 of
 * #1081): the audit's findings with the annotation, the marking and a message. They go in the plan's `warnings`,
 * never in `issues`: a small touch area does not leave the annotation incomplete. A warning the annotation already
 * had before the batch and that the batch did not worsen is not new, so it does not show again.
 */
export function touchWarnings(
  refs: Refs,
  before: Project,
  audits: BatchAudits,
): Record<string, unknown>[] {
  const changed = changedMarkings(before, refs.project);
  if (changed.size === 0) return [];
  const had = new Map(
    [...audits.before.values()]
      .flatMap((entry) => entry.findings)
      .map((finding) => [finding.annotationId, finding] as const),
  );
  return [...audits.after.values()]
    .flatMap((entry) => entry.findings)
    .filter(
      (finding) =>
        changed.has(finding.markingId) &&
        worsened(had.get(finding.annotationId), finding),
    )
    .map((finding) => auditWarning(refs, finding));
}

/**
 * The batch's `issues` with the drawing's items (does not fit, slot not accepted or full) and the audit's
 * (`accessible-label-missing`) added: `new` lists only what the project did not already have before the batch,
 * and `before`, `after` and `resolved` count the annotations with a static pending item, a drawing item or an
 * accessibility item, so what was already there is not new.
 */
export function withDrawingIssues(
  issues: Record<string, unknown>,
  refs: Refs,
  before: Project,
  audits: BatchAudits,
): Record<string, unknown> {
  const { drawingsAfter, drawingsBefore } = audits;
  const hasAfter = drawingItemsOf(refs, refs.project, null, drawingsAfter);
  const proof = drawingProof(refs, before, drawingsAfter);
  const hadBefore = drawingItemsOf(refs, before, null, drawingsBefore);
  const auditAfter = auditIssuesOf(audits.after);
  const auditBefore = auditIssuesOf(audits.before);
  const idsBefore = new Set([
    ...projectIssues(before).keys(),
    ...hadBefore.keys(),
    ...auditBefore.keys(),
  ]);
  const idsAfter = new Set([
    ...projectIssues(refs.project).keys(),
    ...hasAfter.keys(),
    ...auditAfter.keys(),
  ]);
  const counts = {
    before: idsBefore.size,
    after: idsAfter.size,
    resolved: [...idsBefore].filter((id) => !idsAfter.has(id)).length,
  };
  const entries = [...((issues.new as IssueEntry[] | undefined) ?? [])];
  const addGained = (annotationId: string, gained: readonly object[]) => {
    if (gained.length === 0) return;
    const ref = refs.ref('a', annotationId);
    const at = entries.findIndex((e) => e.annotation === ref);
    if (at < 0) entries.push({ annotation: ref, issues: [...gained] });
    else entries[at] = { ...entries[at]!, issues: [...entries[at]!.issues, ...gained] };
  };
  for (const [annotationId, items] of proof) {
    const had = new Set((hadBefore.get(annotationId) ?? []).map(itemKey));
    addGained(
      annotationId,
      items.filter((item) => !had.has(itemKey(item))),
    );
  }
  // Every annotation, not only the changed markings': a part that the batch makes drawn again (its slot child
  // left) belongs to a marking the batch did not change, and `had` already keeps what was there before.
  for (const [annotationId, items] of auditAfter) {
    const had = new Set((auditBefore.get(annotationId) ?? []).map(auditKey));
    addGained(annotationId, items.filter((i) => !had.has(auditKey(i))).map(issueView));
  }
  return { ...issues, ...counts, new: entries };
}
