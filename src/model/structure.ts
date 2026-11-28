import {
  componentMinSize,
  markingComponent,
  type ComponentCatalog,
} from './componentCatalog';
import { componentSlots, slotKey } from './components/slots';
import type { TextMeasurer } from './components/instantiate';
import { creationParents } from './creationRule';
import { fail } from './errors';
import {
  checkRectSize,
  containsRect,
  imagePixelRect,
  isIntegerRect,
  translateRect,
} from './geometry';
import { descendantIds } from './hierarchy';
import {
  clearArrowRoutes,
  relocatedMarkings,
  settleFrom,
  type SettleOptions,
} from './hierarchySettle';
import { canEditMarkingGeometry, requireUnlocked } from './locks';
import { checkArrowsStayOnPage } from './markings';
import { materializedIds, natureChanges, natureOf } from './nature';
import { findById } from './project';
import { projectIndex } from './projectIndex';
import { withoutSlot } from './settleStructure';
import type { Marking, Project, Rect } from './types';

// The operations of the stored structure (stage #3087, decisions 6 and 7): setting the parent of a
// materialized marking, and what happens to the structure when a marking changes nature. Pure.

/** Where a materialized marking goes: a parent, the slot of that parent and the position in the slot. */
export interface ParentTarget {
  readonly parentId: string;
  /** The id of one of the parent's slots (`slotKey`). Required when it has several, refused on an observation parent. */
  readonly slot?: string;
  /** Position among the children of that slot (the array order); the default is after the last. */
  readonly index?: number;
}

/** Options of `setMarkingParent`. */
export interface SetParentOptions extends SettleOptions {
  /** The rectangle the marking takes in the parent's space (its pixels); absent, the same place, converted. */
  readonly rect?: Rect;
}

/** The slot of `childId` in `parentId` as the geometry gives it: only for a parent with several slots. */
export type SlotReader = (
  p: Project,
  parentId: string,
  childId: string,
) => string | undefined;

/** The slots of a materialized parent, by `slotKey`: empty when the catalog does not know its component. */
function slotsOf(p: Project, catalog: ComponentCatalog, parentId: string): string[] {
  const drawn = markingComponent(p, catalog, parentId);
  return drawn === null ? [] : componentSlots(drawn.component).map(slotKey);
}

/**
 * The slot to store for `target` and whether the target is valid: an observation parent takes no slot; a
 * materialized one must have a slot, and says which when it has several. A single slot is never stored.
 */
function slotToStore(
  p: Project,
  catalog: ComponentCatalog,
  target: ParentTarget,
): string | undefined {
  if (natureOf(p, target.parentId) === 'observation') {
    if (target.slot !== undefined) fail('slot-missing', target.slot);
    return undefined;
  }
  const slots = slotsOf(p, catalog, target.parentId);
  if (slots.length === 0) return fail('slot-missing', target.parentId);
  if (slots.length === 1) {
    if (target.slot !== undefined && target.slot !== slots[0])
      fail('slot-missing', target.slot);
    return undefined;
  }
  if (target.slot === undefined || !slots.includes(target.slot)) {
    fail('slot-missing', target.slot ?? target.parentId);
  }
  return target.slot;
}

/** The parent can take the marking: another solid marking that is not the marking or one of its descendants. */
function checkParent(p: Project, marking: Marking, parent: Marking): void {
  if (
    parent.id === marking.id ||
    parent.floating ||
    parent.decorative ||
    descendantIds(p, marking.id).has(parent.id)
  ) {
    fail('invalid-parent', parent.id);
  }
}

/** Is `m` a child of `parentId` in the slot `slot` (absent: no stored slot)? */
const inSlot = (m: Marking, parentId: string, slot: string | undefined): boolean =>
  m.parentId === parentId && m.slot === slot;

/**
 * The array with the marking at the place `index` says among the children of its slot: before the one that
 * is there, or right after the last one when `index` is absent or past the end (after the last child of the
 * parent when the slot has none; in place when the parent has none). An index that is not a position fails
 * with `invalid-index`.
 */
function placed(
  markings: readonly Marking[],
  id: string,
  index: number | undefined,
): readonly Marking[] {
  const marking = markings.find((m) => m.id === id) as Marking;
  if (index !== undefined && (!Number.isInteger(index) || index < 0))
    fail('invalid-index');
  const list = markings.filter((m) => m.id !== id);
  const { parentId, slot } = marking;
  const kids = list.filter((m) => inSlot(m, parentId as string, slot));
  const target = index === undefined ? undefined : kids[index];
  let at: number;
  if (target !== undefined) at = list.indexOf(target);
  else {
    const last =
      kids[kids.length - 1] ?? [...list].reverse().find((m) => m.parentId === parentId);
    at = last === undefined ? markings.indexOf(marking) : list.indexOf(last) + 1;
  }
  const out = [...list];
  out.splice(at, 0, marking);
  return out;
}

/** The marking and its stored subtree (descendants), in one space. */
const subtreeOf = (p: Project, id: string): Set<string> =>
  new Set([id, ...descendantIds(p, id)]);

const sameRectOf = (a: Rect, b: Rect): boolean =>
  a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height;

/** The rectangle the options give, checked as the other rectangle operations do, in the space of `at`. */
function checkedRect(p: Project, at: Pick<Marking, 'containerId'>, rect: Rect): Rect {
  if (!isIntegerRect(rect)) fail('rect-not-integer');
  checkRectSize(rect);
  const container =
    at.containerId === null ? undefined : projectIndex(p).containers.get(at.containerId);
  if (container && !containsRect(imagePixelRect(container), rect)) {
    fail('rect-out-of-image');
  }
  return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
}

/** Does the marking sit in another space than `parent` (another container, or another page of the canvas)? */
const otherSpace = (m: Marking, parent: Marking): boolean =>
  m.containerId !== parent.containerId ||
  (m.containerId === null && m.pageId !== parent.pageId);

/** The subtree of `marking` in the space of `parent`: each rectangle converted from its footprint on the canvas. */
function convertedInto(
  p: Project,
  markingId: string,
  ids: ReadonlySet<string>,
  parent: Marking,
  options: SettleOptions,
): Map<string, Marking> {
  const { containers, pageOf } = projectIndex(p);
  const container =
    parent.containerId === null ? undefined : containers.get(parent.containerId);
  const pageId = container?.pageId ?? pageOf.get(parent.id) ?? parent.pageId;
  checkArrowsStayOnPage(p, markingId, pageId as string);
  const target = { containerId: parent.containerId, pageId: parent.pageId };
  return new Map(
    relocatedMarkings(p, ids, target, options).map((m) => [m.id, m] as const),
  );
}

/** `moved` with the marking at `rect` and its subtree carried by the same offset (it keeps its layout). */
function placedAt(
  p: Project,
  moved: Map<string, Marking>,
  marking: Marking,
  ids: ReadonlySet<string>,
  rect: Rect,
): Map<string, Marking> {
  const at = (id: string): Marking =>
    moved.get(id) ?? (projectIndex(p).markings.get(id) as Marking);
  const own = at(marking.id);
  const dx = rect.x - own.rect.x;
  const dy = rect.y - own.rect.y;
  const out = new Map(moved);
  for (const id of ids) {
    const m = at(id);
    out.set(id, { ...m, rect: id === marking.id ? rect : translateRect(m.rect, dx, dy) });
  }
  return out;
}

/** The array with the changes of `moved` applied. */
function withMoved(p: Project, moved: ReadonlyMap<string, Marking>): Project {
  return moved.size === 0
    ? p
    : { ...p, markings: p.markings.map((m) => moved.get(m.id) ?? m) };
}

/**
 * The options of the settle with the minimum size of the markings that draw a component: they are what
 * keeps a set's size in component units when it changes space (`settleUnits`).
 */
function withMinSizes(
  p: Project,
  catalog: ComponentCatalog,
  options: SettleOptions,
): SettleOptions {
  if (options.minSizeOf !== undefined) return options;
  return { ...options, minSizeOf: (id) => componentMinSize(p, catalog, id) };
}

/** What a target asks for, checked: the parent, the slot to store, and whether the marking moves. */
interface ParentPlan {
  readonly parent: Marking | null;
  readonly slot: string | undefined;
  readonly space: boolean;
  readonly rect: Rect | undefined;
  /** The rectangle or the space changes: geometry, which the lock prevents. */
  readonly moves: boolean;
}

function planParent(
  p: Project,
  catalog: ComponentCatalog,
  marking: Marking,
  target: ParentTarget | null,
  rect: Rect | undefined,
): ParentPlan {
  const parent = target === null ? null : findById(p.markings, target.parentId);
  if (parent !== null) checkParent(p, marking, parent);
  const slot = target === null ? undefined : slotToStore(p, catalog, target);
  const place = rect === undefined ? undefined : checkedRect(p, parent ?? marking, rect);
  const space = parent !== null && otherSpace(marking, parent);
  return {
    parent,
    slot,
    space,
    rect: place,
    moves: space || (place !== undefined && !sameRectOf(place, marking.rect)),
  };
}

/** The markings with `id` at its stored structure and in the place `index` asks for (or in place, if it already sits in that slot). */
function structured(
  markings: readonly Marking[],
  marking: Marking,
  target: ParentTarget | null,
  slot: string | undefined,
): readonly Marking[] {
  const staged = markings.map((m) => {
    if (m.id !== marking.id) return m;
    const loose = withoutSlot({ ...m, parentId: target?.parentId ?? null });
    return slot === undefined ? loose : { ...loose, slot };
  });
  if (target === null) return staged;
  const keepsPlace = target.index === undefined && inSlot(marking, target.parentId, slot);
  return keepsPlace ? staged : placed(staged, marking.id, target.index);
}

const sameIds = (a: readonly Marking[], b: readonly Marking[]): boolean =>
  a.length === b.length && a.every((m, i) => m.id === (b[i] as Marking).id);

/**
 * Sets the parent of a **materialized** marking (decision 6): the parent is chosen, never computed. `target`
 * is the new parent (a materialized marking with a slot, or an observation marking, which has none) or `null`
 * (loose: the `slot` goes away, the marking stays in its space). A materialized parent must have a slot;
 * `slot` is required when it has several and must exist (`slot-missing`; the type's `accepts` is not enforced, the
 * drawing reports it). Never a floating or decorative parent, the marking itself or a descendant
 * (`invalid-parent`). An observation marking has no parent to choose (`parent-by-geometry`).
 *
 * A parent in another space takes the marking and its stored subtree into it (`options.rect` is the marking's
 * place there; without it, the same place converted, size kept in component units). The lock stops it only when
 * the rectangle or the space changes. The result settles: one call is one project change (one undo entry).
 * The same structure returns `p`.
 */
export function setMarkingParent(
  p: Project,
  catalog: ComponentCatalog,
  _measure: TextMeasurer,
  markingId: string,
  target: ParentTarget | null,
  options: SetParentOptions = {},
): Project {
  const marking = requireChoosable(p, markingId);
  const plan = planParent(p, catalog, marking, target, options.rect);
  if (plan.moves) requireUnlocked(canEditMarkingGeometry(p, markingId));
  const settleOptions = withMinSizes(p, catalog, options);
  const base = movedInto(p, marking, plan, settleOptions);
  const markings = structured(base.markings, marking, target, plan.slot);
  if (!plan.moves && sameStructure(marking, p.markings, markings)) return p;
  return settleFrom(p, { ...base, markings }, settleOptions);
}

/** The marking whose parent may be chosen: a materialized, non-floating one. */
function requireChoosable(p: Project, markingId: string): Marking {
  const marking = findById(p.markings, markingId);
  if (natureOf(p, markingId) !== 'materialized') fail('parent-by-geometry', markingId);
  if (marking.floating) fail('invalid-parent', markingId);
  return marking;
}

/** The project with the marking and its subtree in the space and at the place the plan says. */
function movedInto(
  p: Project,
  marking: Marking,
  plan: ParentPlan,
  settleOptions: SettleOptions,
): Project {
  const ids = subtreeOf(p, marking.id);
  let moved = new Map<string, Marking>();
  if (plan.space && plan.parent !== null)
    moved = convertedInto(p, marking.id, ids, plan.parent, settleOptions);
  if (plan.rect !== undefined) moved = placedAt(p, moved, marking, ids, plan.rect);
  const base = withMoved(p, moved);
  return plan.space ? clearArrowRoutes(base, ids) : base;
}

/** Is the structure, the order and the space what the project already has? */
function sameStructure(
  marking: Marking,
  before: readonly Marking[],
  after: readonly Marking[],
): boolean {
  const next = after.find((m) => m.id === marking.id) as Marking;
  return (
    marking.parentId === next.parentId &&
    marking.slot === next.slot &&
    sameIds(after, before)
  );
}

// ---------------------------------------------------------------------------------------
// A marking changes nature (decision 7)

/** Options of the operations that can change a marking's nature. */
export interface NatureOptions {
  /**
   * Reads the slot the geometry gives a new child (`slotReader` of `componentMarkings`): with it, the slot is
   * written along with the parent; without it, the slot stays absent and reads from the geometry.
   */
  readonly slotOf?: SlotReader;
}

/**
 * What happens to the structure when an operation changes the annotations or the specializations (decision 7):
 * a marking that **became materialized** takes once the parent the geometry gives, of either nature (the
 * creation rule), with its slot when `slotOf` is at hand; one that **became an observation marking** loses its
 * `slot` and takes its parent by geometry, and its stored children stay its children. Then it settles. With
 * no nature change it returns `next` as is, at no cost.
 */
export function applyNatureChanges(
  before: Project,
  next: Project,
  options: NatureOptions = {},
): Project {
  const changed = natureChanges(before, next);
  if (changed.size === 0) return next;
  const now = materializedIds(next);
  const became = [...changed].filter((id) => now.has(id));
  const parents = creationParents(next, became);
  const stored = new Set(became);
  const staged: Project = {
    ...next,
    markings: next.markings.map((m) => {
      if (!changed.has(m.id)) return m;
      if (!stored.has(m.id)) return withoutSlot(m);
      return withoutSlot({ ...m, parentId: parents.get(m.id) ?? null });
    }),
  };
  const { slotOf } = options;
  const final =
    slotOf === undefined
      ? staged
      : {
          ...staged,
          markings: staged.markings.map((m) => {
            if (!stored.has(m.id) || m.parentId === null) return m;
            const slot = slotOf(staged, m.parentId, m.id);
            return slot === undefined ? m : { ...m, slot };
          }),
        };
  return settleFrom(before, final);
}
