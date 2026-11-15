/**
 * Named slots (stage #1080, SL1): which slots a component has, which fields only their default
 * content (`fallback`) cites, in which slot a child marking is (`assignSlots`, decision 4) and where a
 * new child goes when there is no geometry (`slotForPlacement`, decision 5).
 *
 * The slot is **derived, not belonging**: nothing here is written to the project, and
 * `settleHierarchy` does not read slots. The type of a child only chooses among the slots that the
 * geometry already gives. Pure functions, no DOM and no dependency on the drawing cache.
 */
import type { ComponentFile, SlotTemplate, TemplateNode } from './componentFormat';
import { referencedFields } from './expressions';

// ---------------------------------------------------------------------------------------
// The slots of a component
// ---------------------------------------------------------------------------------------

const slotsCache = new WeakMap<ComponentFile, readonly SlotTemplate[]>();

function collectSlots(node: TemplateNode, out: SlotTemplate[]): void {
  if (node.type === 'slot') {
    out.push(node);
    return;
  }
  if (node.type !== 'frame') return;
  for (const child of node.children ?? []) collectSlots(child, out);
}

/**
 * The `slot` nodes of the template, in template order, in depth (through the frames' `children`;
 * the `fallback` cannot have a slot and a slot is not valid inside a `repeat`). The same list for
 * the same component. In a `formatVersion` 1 to 3 component, only the first slot (the one the children
 * go to).
 */
export function componentSlots(component: ComponentFile): readonly SlotTemplate[] {
  const known = slotsCache.get(component);
  if (known !== undefined) return known;
  const found: SlotTemplate[] = [];
  collectSlots(component.template, found);
  // Before formatVersion 4 a slot has no `id` to tell it from another: the children go to the first
  // one, as they always did (decision 2), so the others are not listed.
  const slots = component.formatVersion < 4 ? found.slice(0, 1) : found;
  slotsCache.set(component, slots);
  return slots;
}

/** The key of a slot in the maps: its `id`, or the empty key for the only slot that has none. */
/** The axes of a slot whose size follows its children (`hug`, an intrinsic size or an expression). */
export interface HugAxes {
  readonly x: boolean;
  readonly y: boolean;
}

/** Does a size (`width`/`height` of the slot) depend on what is inside it (`hug`, intrinsic, expression)? */
export function takesContent(spec: unknown): boolean {
  if (spec === undefined || typeof spec === 'number' || spec === 'fill') return false;
  return !(typeof spec === 'string' && spec.endsWith('%'));
}

/** Does the slot take its children's size on some axis (so its box grows to the children it takes)? */
export function slotGrows(slot: Pick<SlotTemplate, 'width' | 'height'>): boolean {
  const hug = slotHugAxes(slot);
  return hug.x || hug.y;
}

/** The axes on which the slot takes its children's size: its box there is the content's, not a limit for it. */
export function slotHugAxes(slot: Pick<SlotTemplate, 'width' | 'height'>): HugAxes {
  return { x: takesContent(slot.width), y: takesContent(slot.height) };
}

export function slotKey(slot: Pick<SlotTemplate, 'id'>): string {
  return slot.id ?? '';
}

// ---------------------------------------------------------------------------------------
// Default-content fields
// ---------------------------------------------------------------------------------------

const fieldsCache = new WeakMap<
  ComponentFile,
  ReadonlyMap<string, ReadonlySet<string>>
>();

/** The template without the `fallback` of any slot (copies only along the frames that lead to a slot). */
function withoutFallbacks(node: TemplateNode): TemplateNode {
  if (node.type === 'slot') {
    if (node.fallback === undefined) return node;
    const copy: { -readonly [K in keyof SlotTemplate]: SlotTemplate[K] } = { ...node };
    delete copy.fallback;
    return copy;
  }
  if (node.type !== 'frame' || node.children === undefined) return node;
  return { ...node, children: node.children.map(withoutFallbacks) };
}

/**
 * The default-content fields, per slot (by `slotKey`): the fields that the slot's `fallback` cites and
 * the rest of the template does not (`referencedFields`), i.e. the ones that only exist to draw
 * the default content and stop meaning anything when a child fills the slot. Only the slots with a
 * `fallback` appear; a slot whose `fallback` cites only shared fields has an empty set.
 */
export function fallbackFields(
  component: ComponentFile,
): ReadonlyMap<string, ReadonlySet<string>> {
  const known = fieldsCache.get(component);
  if (known !== undefined) return known;
  const withFallback = componentSlots(component).filter((s) => s.fallback !== undefined);
  const out = new Map<string, ReadonlySet<string>>();
  if (withFallback.length > 0) {
    const rest = referencedFields(withoutFallbacks(component.template));
    for (const slot of withFallback) {
      const own = referencedFields(slot.fallback);
      out.set(slotKey(slot), new Set([...own].filter((field) => !rest.has(field))));
    }
  }
  fieldsCache.set(component, out);
  return out;
}

// ---------------------------------------------------------------------------------------
// Which slot a child is in
// ---------------------------------------------------------------------------------------

export interface SlotRect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/**
 * A slot of an instance, as `assignSlots` and `slotForPlacement` read it. `box` is the slot's box
 * (the probe's: the instance drawn with the slots empty); `accepts` is the already resolved set of
 * type ids it accepts (absent: it accepts everything); `max` is the number of children it holds
 * (absent: no limit); `visible: false` takes the slot out of the candidates.
 */
export interface SlotInput {
  readonly id: string;
  readonly box: SlotRect;
  readonly accepts?: ReadonlySet<string> | undefined;
  readonly max?: number | undefined;
  readonly visible?: boolean | undefined;
  /**
   * The slot hugs its children (`slotHugAxes`): its box is only the content's, so it grows to take in each
   * child assigned to it, and the next child touching that grown box goes to the same slot.
   */
  readonly grows?: boolean | undefined;
}

/** A child marking of the instance: its rectangle and the type of its component annotation (none: no type). */
export interface SlotChild {
  readonly id: string;
  readonly rect: SlotRect;
  readonly typeId?: string | undefined;
}

/** The child that no slot accepts, or the one beyond the slot's `max`. */
export interface SlotIssue {
  readonly code: 'slot-not-accepted' | 'slot-full';
  readonly childId: string;
  readonly slotId: string;
  /** `slot-full` only: the slot's `max`. */
  readonly max?: number;
}

export interface SlotAssignment {
  /** The slot of each child that has one. */
  readonly slotOf: ReadonlyMap<string, string>;
  /** The children of each visible slot (all of them have an entry), in the order of the children given. */
  readonly children: ReadonlyMap<string, readonly string[]>;
  /** The children with no slot to go to (no visible slot), in order. */
  readonly unassigned: readonly string[];
  /** In the order of the children given; for one child, `slot-not-accepted` first. */
  readonly issues: readonly SlotIssue[];
}

function intersection(a: SlotRect, b: SlotRect): number {
  const width = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x);
  const height = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y);
  return width > 0 && height > 0 ? width * height : 0;
}

/** The gap between two rectangles (0 when they touch or overlap): where a child sits relative to a slot's edge. */
function gap(a: SlotRect, b: SlotRect): number {
  const dx = Math.max(a.x - (b.x + b.width), b.x - (a.x + a.width), 0);
  const dy = Math.max(a.y - (b.y + b.height), b.y - (a.y + a.height), 0);
  return Math.hypot(dx, dy);
}

function distance(a: SlotRect, b: SlotRect): number {
  return Math.hypot(
    a.x + a.width / 2 - (b.x + b.width / 2),
    a.y + a.height / 2 - (b.y + b.height / 2),
  );
}

function union(a: SlotRect, b: SlotRect): SlotRect {
  const x = Math.min(a.x, b.x);
  const y = Math.min(a.y, b.y);
  return {
    x,
    y,
    width: Math.max(a.x + a.width, b.x + b.width) - x,
    height: Math.max(a.y + a.height, b.y + b.height) - y,
  };
}

/**
 * The slot of greatest intersection with the rectangle; with none overlapping it, the one whose edge is
 * nearest (then the nearest center); ties go to the first.
 */
function closest(rect: SlotRect, slots: readonly SlotInput[]): SlotInput | undefined {
  let best: SlotInput | undefined;
  let bestArea = 0;
  for (const slot of slots) {
    const area = intersection(slot.box, rect);
    if (area > bestArea) {
      best = slot;
      bestArea = area;
    }
  }
  if (best !== undefined) return best;
  let nearest: SlotInput | undefined;
  let nearestGap = Infinity;
  let nearestDistance = Infinity;
  for (const slot of slots) {
    const g = gap(slot.box, rect);
    const d = distance(slot.box, rect);
    if (g < nearestGap || (g === nearestGap && d < nearestDistance)) {
      nearest = slot;
      nearestGap = g;
      nearestDistance = d;
    }
  }
  return nearest;
}

const acceptsExplicitly = (slot: SlotInput | PlacementSlot, typeId: string | undefined) =>
  slot.accepts !== undefined && typeId !== undefined && slot.accepts.has(typeId);

/**
 * The slots the child may go to, in the first non-empty of the three orders: the slots that accept its
 * type explicitly; the slots without `accepts` (they accept everything, even a child without a type);
 * all of them (and then the child is not accepted).
 */
function candidates(
  slots: readonly SlotInput[],
  typeId: string | undefined,
): { readonly slots: readonly SlotInput[]; readonly accepted: boolean } {
  const explicit = slots.filter((slot) => acceptsExplicitly(slot, typeId));
  if (explicit.length > 0) return { slots: explicit, accepted: true };
  const open = slots.filter((slot) => slot.accepts === undefined);
  if (open.length > 0) return { slots: open, accepted: true };
  return { slots, accepted: false };
}

/**
 * In which slot each child is (decision 4): by geometry, with the type as a filter. For each child,
 * in the first non-empty order of candidates (`candidates`), the slot of greatest intersection with
 * its rectangle, or the nearest one when none touches it, or the first of the template on a tie.
 * `max` does not change the assignment: the children beyond it, in the order given (the siblings'),
 * get `slot-full`. A slot with `visible: false` is not a candidate. With a single slot the result is
 * the one of today: every child goes to it.
 */
export function assignSlots(
  slots: readonly SlotInput[],
  children: readonly SlotChild[],
): SlotAssignment {
  const visible = slots.filter((slot) => slot.visible !== false);
  const slotOf = new Map<string, string>();
  const unassigned = new Set<string>();
  const notAccepted = new Set<string>();
  // A slot that hugs its children grows to each child it takes: the children go in order of their gap to the
  // slots (the nearest first, then the order given), so those in a row away from the empty box follow the first.
  let current = visible;
  const order = children
    .map((child, index) => ({ child, index, gap: gapToSlots(child.rect, visible) }))
    .sort((a, b) => a.gap - b.gap || a.index - b.index);
  for (const { child } of order) {
    const options = candidates(current, child.typeId);
    const chosen = closest(child.rect, options.slots);
    if (chosen === undefined) {
      unassigned.add(child.id);
      continue;
    }
    slotOf.set(child.id, chosen.id);
    if (!options.accepted) notAccepted.add(child.id);
    if (chosen.grows === true)
      current = current.map((slot) =>
        slot.id === chosen.id ? { ...slot, box: union(slot.box, child.rect) } : slot,
      );
  }
  // The results keep the order of the children given (the siblings').
  const lists = new Map<string, string[]>(visible.map((slot) => [slot.id, []]));
  const ordered = new Map<string, string>();
  for (const child of children) {
    const id = slotOf.get(child.id);
    if (id === undefined) continue;
    ordered.set(child.id, id);
    lists.get(id)?.push(child.id);
  }
  return {
    slotOf: ordered,
    children: lists,
    unassigned: children.filter((c) => unassigned.has(c.id)).map((c) => c.id),
    issues: slotIssues(visible, children, ordered, lists, notAccepted),
  };
}

/** The smallest gap between a rectangle and any slot (the order in which `assignSlots` takes the children). */
function gapToSlots(rect: SlotRect, slots: readonly SlotInput[]): number {
  return slots.reduce((least, slot) => Math.min(least, gap(slot.box, rect)), Infinity);
}

function slotIssues(
  slots: readonly SlotInput[],
  children: readonly SlotChild[],
  slotOf: ReadonlyMap<string, string>,
  lists: ReadonlyMap<string, readonly string[]>,
  notAccepted: ReadonlySet<string>,
): SlotIssue[] {
  const max = new Map(slots.map((slot) => [slot.id, slot.max]));
  const out: SlotIssue[] = [];
  for (const child of children) {
    const slotId = slotOf.get(child.id);
    if (slotId === undefined) continue;
    if (notAccepted.has(child.id))
      out.push({ code: 'slot-not-accepted', childId: child.id, slotId });
    const limit = max.get(slotId);
    if (limit !== undefined && (lists.get(slotId) ?? []).indexOf(child.id) >= limit)
      out.push({ code: 'slot-full', childId: child.id, slotId, max: limit });
  }
  return out;
}

// ---------------------------------------------------------------------------------------
// Where a new child goes, without geometry
// ---------------------------------------------------------------------------------------

/** A slot as `slotForPlacement` reads it: no box (there is no geometry). */
export type PlacementSlot = Omit<SlotInput, 'box'>;

export interface PlacementRequest {
  /** The slot asked for (`slot` of the screen's entry node, of `componentPlacement` or of `create_marking`). */
  readonly slot?: string | undefined;
  /** The type of the new child (none: only the slots without `accepts` accept it). */
  readonly typeId?: string | undefined;
  /** How many children each slot has now (absent: none), to know which ones are full. */
  readonly counts?: ReadonlyMap<string, number> | undefined;
}

export type PlacementResult =
  | {
      readonly ok: true;
      readonly id: string;
      /** `requested`, `accepts` (accepts and not full), `accepts-full` (all that accept are full) or `first`. */
      readonly basis: 'requested' | 'accepts' | 'accepts-full' | 'first';
    }
  | { readonly ok: false; readonly reason: 'unknown-slot'; readonly slot: string }
  | { readonly ok: false; readonly reason: 'no-slots' };

const isFull = (slot: PlacementSlot, counts: PlacementRequest['counts']): boolean =>
  slot.max !== undefined && (counts?.get(slot.id) ?? 0) >= slot.max;

/**
 * The slot of a new child when there is no geometry (decision 5), in this order: the slot asked for
 * (an id the component does not have is an error of whoever asked); the first visible slot that
 * accepts the type (explicitly first, then those without `accepts`) and is not full; the first that
 * accepts, even full; the first slot (visible, or the first of all when none is).
 */
export function slotForPlacement(
  slots: readonly PlacementSlot[],
  request: PlacementRequest,
): PlacementResult {
  if (slots.length === 0) return { ok: false, reason: 'no-slots' };
  if (request.slot !== undefined) {
    const asked = slots.find((slot) => slot.id === request.slot);
    return asked === undefined
      ? { ok: false, reason: 'unknown-slot', slot: request.slot }
      : { ok: true, id: asked.id, basis: 'requested' };
  }
  const visible = slots.filter((slot) => slot.visible !== false);
  const accepting = [
    ...visible.filter((slot) => acceptsExplicitly(slot, request.typeId)),
    ...visible.filter((slot) => slot.accepts === undefined),
  ];
  const free = accepting.find((slot) => !isFull(slot, request.counts));
  if (free !== undefined) return { ok: true, id: free.id, basis: 'accepts' };
  const [firstAccepting] = accepting;
  if (firstAccepting !== undefined)
    return { ok: true, id: firstAccepting.id, basis: 'accepts-full' };
  const first = visible[0] ?? slots[0];
  return { ok: true, id: (first as PlacementSlot).id, basis: 'first' };
}
