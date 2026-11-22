import {
  resolveSlotLayout,
  slotClipShapes,
  slotsOfScene,
  tokenizedComponent,
  type ResolvedSlotLayout,
} from './components/arrange';
import { intersectClips } from './components/box';
import type {
  ComponentFile,
  FieldValues,
  ScreenAnchor,
  SlotTemplate,
} from './components/componentFormat';
import {
  instantiate,
  type InstantiateOptions,
  type SlotSize,
  type TextMeasurer,
} from './components/instantiate';
import { applyTokens, type ResolvedTokens } from './components/tokens';
import {
  assignSlots,
  componentSlots,
  fallbackFields,
  slotHugAxes,
  slotKey,
  type HugAxes,
  type SlotAssignment,
  type SlotChild,
} from './components/slots';
import { typeSlots, type TypeSlot } from './specSlots';
import { slotInputsOf, type RevealedSlot } from './componentSlotInputs';
import {
  NO_PROVIDED,
  extendProvided,
  pickProvided,
  sameProvided,
  type ProvidedValues,
} from './components/provided';
import {
  markingComponent,
  type ComponentCatalog,
  type MarkingComponent,
} from './componentCatalog';
import { drawingValues } from './componentValues';
import {
  withContainer,
  sameContainer,
  type InstanceContainer,
} from './components/container';
import type { ModelMessage } from './modelMessage';
import { DEFAULT_LABEL_TEXTS } from './refs';
import { effectiveDensity, unitSpaceOf, type UnitSpace } from './density';
import { effectiveDirection } from './direction';
import { effectiveDrawingMode, instanceAnchorOf, readContainerOf } from './drawingMode';
import { topDown } from './hierarchy';
import { projectIndex } from './projectIndex';
import {
  multiply,
  type CornerRadius,
  type FrameNode,
  type Matrix,
} from './components/scene';
import type { AnchorSide, Marking, Project, ReadingDirection, Rect } from './types';

// Component drawings (Library stage, B3): the instantiated scene of each marking that has a
// component, derived from the project (the marking's rectangle, the annotation's type and
// values, the specialization's template) and never saved. The cache only re-instantiates the
// marking whose inputs changed and returns the **same object** for the rest: the canvas
// compares by identity.

export interface ComponentDrawing {
  readonly markingId: string;
  /** Marking's container; `null` = canvas marking (rectangle in canvas units). */
  readonly containerId: string | null;
  readonly annotationId: string;
  /**
   * Id of the specialization the component belongs to: with a path in the scene (an image
   * `Paint`'s `asset`) it names the package file to draw, `(specId, asset)`.
   */
  readonly specId: string;
  /**
   * Layer (of the project) of the annotation that draws: the view mode removes the drawing by
   * it.
   */
  readonly layerId: string;
  /**
   * Scene instantiated in the marking's box **in component units**; the root's matrix carries
   * `translate(rect.x, rect.y) · scale(density)`, so what is drawn comes out in image pixels
   * (or canvas units, where the density is 1).
   */
  readonly root: FrameNode;
  /**
   * Warnings from the engine (without a code, as text) and from the values' references (with
   * a code).
   */
  readonly warnings: readonly ModelMessage[];
  /**
   * Does not fit: the engine's "content larger than the box" warning or a child outside the
   * slot's box.
   */
  readonly overflow: boolean;
  /**
   * How much is missing (image px) in each "does not fit", from the engine warning's message (in
   * units × the density); the child outside the slot enters as `SLOT_OVERFLOW`. Empty when it
   * fits or when the drawing is in screen pixels.
   */
  readonly shortfalls: Readonly<Record<string, number>>;
  /**
   * Component with `screen`: `root` measures the component's `size` at the origin, in screen
   * pixels, and the canvas anchors it at `anchor` in the `rect` (the marking's rectangle, in
   * image pixels).
   */
  readonly screen?: { readonly anchor: ScreenAnchor; readonly rect: Rect };
  /**
   * Clip of the child of a slot with `clip` (v4): the parent's slot box, in the same space as
   * `root.transform` (image pixels or canvas units). The drawing only shows inside it.
   */
  readonly clip?: Rect;
  /**
   * Rounded shapes that also cut the child of a slot with `clip` (decision 23 of #1080): the boxes of
   * the template frames (with `clip` and a `cornerRadius` > 0) that contain the slot, in the same
   * space as `clip` (image pixels or canvas units), with their radius already in that space. The
   * drawing only shows inside `clip` **and** inside every shape. Only present when some shape has a
   * radius (without it, `clip` is the whole story); a child of the child inherits its parent's shapes
   * and adds its own.
   */
  readonly clipShape?: readonly ClipShape[];
  /**
   * The marking sits in a slot hidden by `visible` (or under a marking that does): it keeps its outline and its
   * place in the project but is not drawn (#1978). Absent otherwise.
   */
  readonly hidden?: true;
  /**
   * The slots of the drawn scene (decision 7 of #1080), in template order, with the box of the final
   * drawing in image pixels (or canvas units) and the child markings the geometry put in each one.
   * Empty with `screen` (no probe and no assignment) and in a component without a slot.
   */
  readonly slots: readonly DrawnSlot[];
  /**
   * The slot (its `id`; the empty key for the one without `id`) of each child marking of this one;
   * `null` for the child that no visible slot receives. Empty with `screen`.
   */
  readonly slotOf: ReadonlyMap<string, string | null>;
  /**
   * The default-content fields of the slots that hold child markings (they mean nothing while a
   * child fills the slot), by field name, with the `id` of the filled slot (`fallbackFields`).
   */
  readonly inactiveFields: ReadonlyMap<string, string>;
  /**
   * The children no slot accepts or beyond a slot's `max`, by the `accepts` and `max` of the type
   * (decision 10 of #1080): one per issue, on the child's annotation with a component. Empty when the
   * type declares no `slots`. `derived.ts` and the MCP read it like they read `overflow`.
   */
  readonly slotIssues: readonly DrawingSlotIssue[];
  /**
   * The marking's anchor (v20): the stored side (absent = the component's default) and the
   * target marking's rectangle, in the same space as the `rect` (container pixels or canvas
   * units). It is what the engine reads in the `$anchor.*` pseudo-fields (R3, part 2); absent
   * without an anchor.
   */
  readonly anchor?: DrawingAnchor;
}

/** A child that a slot does not accept (`slot-not-accepted`) or that goes past its `max` (`slot-full`). */
export interface DrawingSlotIssue {
  /** The child's annotation that has the component (the one the cache draws). */
  readonly annotationId: string;
  readonly code: 'slot-not-accepted' | 'slot-full' | 'slot-hidden';
  /** The slot the geometry put the child in (`name`: the type's, else the label, else the `id`). */
  readonly slot: { readonly id: string; readonly name: string };
  /** The name of this marking's type (the owner of the slot). */
  readonly owner: string;
  /** `slot-full` only: how many children the slot takes. */
  readonly max?: number;
}

/** One slot of a drawing (see `ComponentDrawing.slots`). */
export interface DrawnSlot {
  /** The slot's `id` (`slotKey`): the empty key for the only slot that has none. */
  readonly id: string;
  /** The slot's label, as the scene names it. */
  readonly name: string;
  readonly box: Rect;
  /** The ids of the child markings in the slot, in the order of the siblings. */
  readonly children: readonly string[];
  /** The slot draws its default content (it has a `fallback` and no child). */
  readonly fallback: boolean;
  /**
   * The slot is hidden by its `visible` but still holds children (#1978): `box` is the one it would have if
   * visible and the children are not drawn. Only slots with children are listed.
   */
  readonly hidden: boolean;
}

/** A rounded box that cuts the drawing of a slot's child (see `ComponentDrawing.clipShape`). */
export interface ClipShape {
  readonly box: Rect;
  readonly radius: CornerRadius;
}

/** The side and rectangle of a drawing's anchor (see `ComponentDrawing.anchor`). */
export interface DrawingAnchor {
  readonly side?: AnchorSide;
  readonly rect: Rect;
}

/** By marking id, inserted in drawing order (parents before children; siblings in array order). */
export type ComponentDrawings = ReadonlyMap<string, ComponentDrawing>;

export const NO_DRAWINGS: ComponentDrawings = new Map();

/** Tolerance (px) between the slot's box (decimal) and the integer rectangle of a child. */
const SLOT_TOLERANCE = 1;

export type DrawingCache = (
  p: Project | null,
  catalog: ComponentCatalog,
  measure: TextMeasurer,
  epoch: number,
  /** Label of an unnamed free annotation in `ref` values; the default is the MCP's. */
  untitled?: string,
) => ComponentDrawings;

interface Entry {
  readonly markingId: string;
  readonly containerId: string | null;
  readonly annotationId: string;
  readonly rect: Rect;
  readonly component: ComponentFile;
  readonly values: FieldValues;
  readonly valueWarnings: readonly ModelMessage[];
  readonly measure: TextMeasurer;
  readonly epoch: number;
  /** Effective drawing mode of the marking (`undefined` = the first mode). */
  readonly mode: string | undefined;
  /** Density of the marking's container (1 on the canvas). */
  readonly density: number;
  /** Effective reading direction of the marking (`ltr` by default): `rtl` mirrors the drawing. */
  readonly direction: ReadingDirection;
  /**
   * The container's size and classes (`$container.*`, decision 17 of #1901): only for a component that reads
   * them, so a change in the container never redraws the others.
   */
  readonly container: InstanceContainer | undefined;
  /**
   * The marking's anchor (side and target rectangle); `undefined` without an anchor (decision
   * 15).
   */
  readonly anchor: DrawingAnchor | undefined;
  /** The direct children (containers only): id, rectangle and type id, in sibling order. */
  readonly kids: readonly DrawKid[];
  /** The slots of the type with `accepts` and `max` (decision 5); empty without children. */
  readonly slotDefs: readonly TypeSlot[];
  /** The owner type's name, which `slotIssues` carry (`DrawingSlotIssue.owner`). */
  readonly ownerName: string;
  /**
   * Inherited color: only the values offered by the ancestors that the component reads
   * (`$provided`).
   */
  readonly provided: ProvidedValues;
  /** What this marking's slot offers to its children (`provide`), already resolved. */
  readonly offers: ProvidedValues | undefined;
  /** What each slot with `clip` of this marking imposes on its children. */
  readonly slotClips: ReadonlyMap<string, SlotClip>;
  /** What this marking receives from the slot of its parent that it is in. */
  readonly received: Received;
  /** What each child receives: its slot's clip and shapes inside what this marking received. */
  readonly childReceived: ReadonlyMap<string, Received>;
  readonly drawing: ComponentDrawing;
}

function sameRect(a: Rect, b: Rect): boolean {
  return a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height;
}

/**
 * A drawing's anchor: the stored side and the target rectangle; `undefined` without an anchor
 * or target.
 */
function anchorOfMarking(
  marking: Marking,
  markings: ReadonlyMap<string, Marking>,
): DrawingAnchor | undefined {
  const { anchor } = marking;
  const target = anchor == null ? undefined : markings.get(anchor.to);
  if (anchor == null || target === undefined) return undefined;
  return anchor.side === undefined
    ? { rect: target.rect }
    : { side: anchor.side, rect: target.rect };
}

function sameAnchor(a: DrawingAnchor | undefined, b: DrawingAnchor | undefined): boolean {
  if (a === undefined || b === undefined) return a === b;
  return a.side === b.side && sameRect(a.rect, b.rect);
}

/** A child of the instance as the cache reads it: what `assignSlots` needs plus the annotation the issues go on. */
interface DrawKid extends SlotChild {
  readonly annotationId: string | undefined;
}

function sameKids(a: readonly DrawKid[], b: readonly DrawKid[]): boolean {
  return (
    a.length === b.length &&
    a.every((kid, i) => {
      const other = b[i] as DrawKid;
      return (
        kid.id === other.id &&
        kid.typeId === other.typeId &&
        kid.annotationId === other.annotationId &&
        sameRect(kid.rect, other.rect)
      );
    })
  );
}

/** The slots of the type are the same: ids, names, `max` and the set of accepted types (it decides the slots). */
function sameSlotDefs(a: readonly TypeSlot[], b: readonly TypeSlot[]): boolean {
  return (
    a.length === b.length &&
    a.every((slot, i) => {
      const other = b[i] as TypeSlot;
      return (
        slot.id === other.id &&
        slot.name === other.name &&
        slot.max === other.max &&
        sameAccepts(slot.accepts, other.accepts)
      );
    })
  );
}

/** The slot inputs of the drawing are the same: the slots of the type and the type's name (the issues' owner). */
function sameSlotInputs(
  before: Entry,
  slotDefs: readonly TypeSlot[],
  ownerName: string,
): boolean {
  return before.ownerName === ownerName && sameSlotDefs(before.slotDefs, slotDefs);
}

function sameAccepts(
  a: ReadonlySet<string> | undefined,
  b: ReadonlySet<string> | undefined,
): boolean {
  if (a === undefined || b === undefined) return a === b;
  return a.size === b.size && [...a].every((id) => b.has(id));
}

/** Same value; the rows of a table (lists recreated on every read) compare cell by cell. */
function sameFieldValue(a: FieldValues[string], b: FieldValues[string]): boolean {
  if (Object.is(a, b)) return true;
  if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
  return a.every((row, i) => {
    const other = b[i];
    if (row === other) return true;
    if (other === undefined) return false;
    const keys = Object.keys(row);
    return (
      keys.length === Object.keys(other).length &&
      keys.every((key) => key in other && Object.is(row[key], other[key]))
    );
  });
}

function shallowEqual(a: FieldValues, b: FieldValues): boolean {
  const keysA = Object.keys(a);
  if (keysA.length !== Object.keys(b).length) return false;
  return keysA.every((key) => key in b && sameFieldValue(a[key], b[key]));
}

/** The previous rectangle when it equals the new one (the canvas compares the clip by identity). */
function stableRect(before: Rect | undefined, next: Rect | undefined): Rect | undefined {
  return before !== undefined && next !== undefined && sameRect(before, next)
    ? before
    : next;
}

function sameRadius(a: CornerRadius, b: CornerRadius): boolean {
  if (typeof a === 'number' || typeof b === 'number') return a === b;
  return a.every((r, i) => r === b[i]);
}

function sameShapes(
  a: readonly ClipShape[] | undefined,
  b: readonly ClipShape[] | undefined,
): boolean {
  if (a === undefined || b === undefined) return a === b;
  return (
    a.length === b.length &&
    a.every((s, i) => {
      const other = b[i] as ClipShape;
      return sameRect(s.box, other.box) && sameRadius(s.radius, other.radius);
    })
  );
}

/** The previous shapes when they equal the new ones (the canvas compares them by identity). */
function stableShapes(
  before: readonly ClipShape[] | undefined,
  next: readonly ClipShape[] | undefined,
): readonly ClipShape[] | undefined {
  return sameShapes(before, next) ? before : next;
}

/** What a marking receives from the slot of its parent that it is in (see `ComponentDrawing.clip`). */
interface Received {
  readonly clip: Rect | undefined;
  readonly shapes: readonly ClipShape[] | undefined;
  /** The marking is in a hidden slot of its parent, or under one that is. */
  readonly hidden: boolean;
}

const NOTHING_RECEIVED: Received = { clip: undefined, shapes: undefined, hidden: false };

/** What one slot with `clip` imposes on its children (image pixels or canvas units). */
interface SlotClip {
  readonly clip: Rect;
  readonly shapes: readonly ClipShape[] | undefined;
}

const NO_SLOT_CLIPS: ReadonlyMap<string, SlotClip> = new Map();

/** A drawing with the clip and the shapes its parent's slot gives it (without the keys when there are none). */
function withReceived(drawing: ComponentDrawing, received: Received): ComponentDrawing {
  const copy: { -readonly [K in keyof ComponentDrawing]: ComponentDrawing[K] } = {
    ...drawing,
  };
  delete copy.clip;
  delete copy.clipShape;
  delete copy.hidden;
  if (received.hidden) copy.hidden = true;
  if (received.clip !== undefined) copy.clip = received.clip;
  if (received.shapes !== undefined) copy.clipShape = received.shapes;
  return copy;
}

/**
 * What a marking passes down to each of its children: the clip of the slot the child is in (when it
 * has `clip`) inside what the marking itself received, and the rounded shapes it received plus the
 * slot's. A child in no slot, or in one without `clip`, gets what the marking received. Reuses the
 * previous values when equal (the canvas compares them by identity).
 */
function childReceived(
  slotClips: ReadonlyMap<string, SlotClip>,
  slotOf: ReadonlyMap<string, string | null>,
  received: Received,
  before: ReadonlyMap<string, Received> | undefined,
  hiddenSlots: ReadonlySet<string>,
): ReadonlyMap<string, Received> {
  const out = new Map<string, Received>();
  for (const [childId, slot] of slotOf) {
    const own = slot === null ? undefined : slotClips.get(slot);
    const hidden = received.hidden || (slot !== null && hiddenSlots.has(slot));
    out.set(childId, receivedFrom(own, received, before?.get(childId), hidden));
  }
  return out;
}

/** The ids of the drawing's slots that are hidden by `visible` (and hold children). */
function hiddenSlotIds(drawing: ComponentDrawing): ReadonlySet<string> {
  const ids = drawing.slots.filter((slot) => slot.hidden).map((slot) => slot.id);
  return ids.length === 0 ? NO_HIDDEN : new Set(ids);
}

const NO_HIDDEN: ReadonlySet<string> = new Set();

const HIDDEN_RECEIVED: Received = { clip: undefined, shapes: undefined, hidden: true };

/**
 * The children of a hidden marking that no slot of it received (it has no slots) are hidden too: what is under
 * a hidden marking is not drawn, whatever it is.
 */
function passHidden(
  passed: Map<string, Received>,
  kids: readonly Marking[] | undefined,
  received: Received,
): void {
  if (!received.hidden) return;
  for (const kid of kids ?? [])
    if (!passed.has(kid.id)) passed.set(kid.id, HIDDEN_RECEIVED);
}

/** What one child receives: its slot's clip inside what the marking received, with stable identities. */
function receivedFrom(
  own: SlotClip | undefined,
  received: Received,
  previous: Received | undefined,
  hidden: boolean,
): Received {
  const shapes = [...(received.shapes ?? []), ...(own?.shapes ?? [])];
  return {
    hidden,
    clip: stableRect(previous?.clip, intersectClips(own?.clip, received.clip)),
    shapes: stableShapes(previous?.shapes, shapes.length === 0 ? undefined : shapes),
  };
}

/**
 * What situates the drawing: the screen anchor (`screen`) or, otherwise, what the parent's slot
 * gives it (`clip` and `clipShape`).
 */
function placement(
  screen: ComponentFile['screen'],
  rect: Rect,
  received: Received,
): Pick<ComponentDrawing, 'screen' | 'clip' | 'clipShape' | 'hidden'> {
  if (screen !== undefined)
    return { screen: { anchor: screen.anchor ?? 'center', rect } };
  return {
    ...(received.hidden ? { hidden: true as const } : {}),
    ...(received.clip === undefined ? {} : { clip: received.clip }),
    ...(received.shapes === undefined ? {} : { clipShape: received.shapes }),
  };
}

/** The matrix of the scene root in units: `translate(rect.x, rect.y) · scale(density)`. */
function rootMatrix(rect: Rect, density: number): Matrix {
  return [density, 0, 0, density, rect.x, rect.y];
}

/** Key of `shortfalls` for the child that goes past the slot's box. */
export const SLOT_OVERFLOW = 'content larger than the box: slot';

/** The `shortfalls` key of a slot: the plain one for the slot without `id`, otherwise with its `id`. */
export function slotOverflowKey(slotId: string): string {
  return slotId === '' ? SLOT_OVERFLOW : `${SLOT_OVERFLOW} ${slotId}`;
}

const NO_HUG: HugAxes = { x: false, y: false };

/**
 * How much the worst child goes past the slot's box (with the rounding tolerance); 0 = fits. On a
 * `hug` axis the box takes the children's size and the layout places it by the slot's own rules, so
 * only the children's extent counts there, not where they happen to sit (a child inside its slot
 * does not become an overflow because the shrunk box moved).
 */
function slotExcess(
  box: Rect,
  childRects: readonly Rect[],
  hug: HugAxes = NO_HUG,
): number {
  const worst = Math.max(
    0,
    axisExcess(childRects, box.x, box.width, hug.x, 'x', 'width'),
    axisExcess(childRects, box.y, box.height, hug.y, 'y', 'height'),
  );
  return worst > 0 ? worst + SLOT_TOLERANCE : 0;
}

/** The excess on one axis: positions against the box, or, on a `hug` axis, the children's extent against its size. */
function axisExcess(
  rects: readonly Rect[],
  start: number,
  size: number,
  hug: boolean,
  at: 'x' | 'y',
  length: 'width' | 'height',
): number {
  if (rects.length === 0) return 0;
  if (hug) {
    const extent =
      Math.max(...rects.map((r) => r[at] + r[length])) -
      Math.min(...rects.map((r) => r[at]));
    return extent - size - SLOT_TOLERANCE;
  }
  return Math.max(
    ...rects.map((r) =>
      Math.max(
        start - SLOT_TOLERANCE - r[at],
        r[at] + r[length] - (start + size + SLOT_TOLERANCE),
      ),
    ),
  );
}

/**
 * The drawing's "does not fit": the engine's warning (with how much is missing) and, per slot, the
 * children outside its box.
 */
function overflowsOf(
  instantiated: ReturnType<typeof instantiate>,
  slots: readonly DrawnSlot[],
  rectOf: ReadonlyMap<string, Rect>,
  density: number,
  hugOf: ReadonlyMap<string, HugAxes> = new Map(),
): Record<string, number> {
  const found: Record<string, number> = {};
  const shortfalls = instantiated.shortfalls ?? {};
  for (const w of instantiated.overflowWarnings ?? [])
    found[w] = (shortfalls[w] ?? 0) * density;
  for (const slot of slots) {
    if (slot.hidden) continue;
    const rects = slot.children.flatMap((id) => rectOf.get(id) ?? []);
    const excess = rects.length > 0 ? slotExcess(slot.box, rects, hugOf.get(slot.id)) : 0;
    if (excess > 0) found[slotOverflowKey(slot.id)] = excess;
  }
  return found;
}

/**
 * The anchor in the form the instance reads (`$anchor.*`, in units); `undefined` without an
 * anchor.
 */
function instanceAnchor(
  anchor: DrawingAnchor | undefined,
  rect: Rect,
  component: ComponentFile,
  density: number,
): InstantiateOptions['anchor'] {
  if (anchor === undefined) return undefined;
  return instanceAnchorOf({
    rect,
    anchorRect: anchor.rect,
    side: anchor.side,
    component,
    density,
  });
}

/**
 * The `instantiate` options of a marking: only carries `tokens`, `provided`, `direction`,
 * `anchor` and `container` when present.
 */
function instantiateOptions(
  markingId: string,
  measure: TextMeasurer,
  tokens: ResolvedTokens | undefined,
  provided: ProvidedValues,
  direction: ReadingDirection,
  anchor: InstantiateOptions['anchor'],
  container: InstanceContainer | undefined,
): InstantiateOptions {
  return {
    measure,
    idPrefix: markingId,
    ...(tokens === undefined ? {} : { tokens }),
    ...(provided === NO_PROVIDED ? {} : { provided }),
    ...(direction === 'rtl' ? { direction } : {}),
    ...(anchor === undefined ? {} : { anchor }),
    ...(container === undefined ? {} : { container }),
  };
}

/**
 * The scene with the density scale at the root; with density 1 the scene itself (already in
 * pixels).
 */
function withRootMatrix(root: FrameNode, rect: Rect, density: number): FrameNode {
  return density === 1
    ? root
    : { ...root, transform: multiply(rootMatrix(rect, density), root.transform) };
}

// ---------------------------------------------------------------------------------------
// Slots: the probe, the assignment and the final drawing (decisions 6 and 7 of #1080)
// ---------------------------------------------------------------------------------------

const NO_SLOTS: readonly DrawnSlot[] = [];
const NO_SLOT_OF: ReadonlyMap<string, string | null> = new Map();
const NO_FIELDS: ReadonlyMap<string, string> = new Map();
const NO_ISSUES: readonly DrawingSlotIssue[] = [];
const NO_DEFS: readonly TypeSlot[] = [];

/** The hug axes of each slot of the component, by slot key. */
function hugAxesOf(component: ComponentFile): ReadonlyMap<string, HugAxes> {
  return new Map(
    componentSlots(component).map((slot) => [slotKey(slot), slotHugAxes(slot)]),
  );
}

/** Does the slot's size depend on its children (so the final drawing measures them)? */
function measuresContent(slot: SlotTemplate): boolean {
  const hug = slotHugAxes(slot);
  return hug.x || hug.y;
}

/** The box that joins the rectangles (image pixels), in component units, plus the slot's padding. */
function contentSize(
  rects: readonly Rect[],
  padding: ResolvedSlotLayout['padding'],
  density: number,
): SlotSize {
  const left = Math.min(...rects.map((r) => r.x));
  const top = Math.min(...rects.map((r) => r.y));
  const right = Math.max(...rects.map((r) => r.x + r.width));
  const bottom = Math.max(...rects.map((r) => r.y + r.height));
  return {
    width: (right - left) / density + padding.left + padding.right,
    height: (bottom - top) / density + padding.top + padding.bottom,
  };
}

/** The slot template with that key, with the tokens applied (its `padding` can be a token). */
function tokenizedSlot(
  component: ComponentFile,
  tokens: ResolvedTokens | undefined,
  key: string,
): SlotTemplate | undefined {
  const drawn =
    tokens === undefined ? tokenizedComponent(component) : applyTokens(component, tokens);
  return componentSlots(drawn).find((slot) => slotKey(slot) === key);
}

/** What the probe and the assignment decide about the final drawing. */
interface SlotPlan {
  readonly assignment: SlotAssignment;
  /** The slots hidden by `visible` (by id), with the box they would have if visible. */
  readonly revealed: ReadonlyMap<string, RevealedSlot>;
  /** `slotContent` of the final drawing: the children's size of each filled slot that measures them. */
  readonly content: ReadonlyMap<string, SlotSize>;
  /** The other filled slots (a fixed size has nothing to measure): only their `fallback` goes away. */
  readonly filled: ReadonlySet<string>;
  /** Is the probe not the final drawing (a filled slot has a `fallback` or measures its children)? */
  readonly needsFinal: boolean;
}

function planSlots(
  mc: MarkingComponent,
  values: FieldValues,
  tokens: ResolvedTokens | undefined,
  kids: readonly SlotChild[],
  defs: readonly TypeSlot[],
  space: UnitSpace,
  probe: FrameNode,
  reveal: Pick<Parameters<typeof slotInputsOf>[0], 'target' | 'options'>,
): SlotPlan {
  const { inputs, revealed } = slotInputsOf({
    component: mc.component,
    values,
    ...reveal,
    probe,
    space,
    defs: new Map(defs.map((def) => [def.id, def])),
    hasKids: kids.length > 0,
  });
  const assignment = assignSlots(inputs, kids);
  const templates = new Map(componentSlots(mc.component).map((s) => [slotKey(s), s]));
  const rectOf = new Map(kids.map((k) => [k.id, k.rect]));
  const content = new Map<string, SlotSize>();
  const filled = new Set<string>();
  let needsFinal = false;
  for (const [id, ids] of assignment.children) {
    const template = templates.get(id);
    if (ids.length === 0 || template === undefined || revealed.has(id)) continue;
    needsFinal ||= template.fallback !== undefined || measuresContent(template);
    if (!measuresContent(template)) {
      filled.add(id);
      continue;
    }
    const slot = tokenizedSlot(mc.component, tokens, id) ?? template;
    const { padding } = resolveSlotLayout(slot, values);
    content.set(
      id,
      contentSize(
        ids.flatMap((childId) => rectOf.get(childId) ?? []),
        padding,
        space.density,
      ),
    );
  }
  return { assignment, revealed, content, filled, needsFinal };
}

/** The radius of a shape in image pixels (× the density). */
function scaledRadius(radius: CornerRadius, density: number): CornerRadius {
  if (density === 1) return radius;
  return typeof radius === 'number'
    ? radius * density
    : ([
        radius[0] * density,
        radius[1] * density,
        radius[2] * density,
        radius[3] * density,
      ] as const);
}

/** What each slot with `clip` of the drawn scene imposes on its children (in image pixels). */
function slotClipsOf(root: FrameNode, space: UnitSpace): ReadonlyMap<string, SlotClip> {
  const out = new Map<string, SlotClip>();
  for (const [id, slot] of slotsOfScene(root)) {
    if (!slot.clip) continue;
    const shapes = slotClipShapes(root, id).map((shape) => ({
      box: space.toPixels(shape.box),
      radius: scaledRadius(shape.radius, space.density),
    }));
    out.set(id, {
      clip: space.toPixels(slot.box),
      shapes: shapes.length === 0 ? undefined : shapes,
    });
  }
  return out.size === 0 ? NO_SLOT_CLIPS : out;
}

/**
 * The slots of the drawn scene, with their boxes in image pixels and their children, in template order. A slot
 * hidden by `visible` is listed only when it holds children, with the box it would have if visible.
 */
function drawnSlots(
  component: ComponentFile,
  root: FrameNode,
  space: UnitSpace,
  plan: SlotPlan,
): readonly DrawnSlot[] {
  const templates = new Map(componentSlots(component).map((s) => [slotKey(s), s]));
  const scene = slotsOfScene(root);
  const out: DrawnSlot[] = [];
  for (const [id, template] of templates) {
    const children = plan.assignment.children.get(id) ?? [];
    const slot = scene.get(id);
    const found = slot ?? (children.length === 0 ? undefined : plan.revealed.get(id));
    if (found === undefined) continue;
    out.push({
      id,
      name: found.name,
      box: slot === undefined ? (found as RevealedSlot).box : space.toPixels(slot.box),
      children,
      fallback: children.length === 0 && template.fallback !== undefined,
      hidden: slot === undefined,
    });
  }
  return out;
}

/** The default-content fields of the slots that hold children (they mean nothing now), by field. */
function inactiveFieldsOf(
  component: ComponentFile,
  assignment: SlotAssignment,
): ReadonlyMap<string, string> {
  const out = new Map<string, string>();
  for (const [id, fields] of fallbackFields(component)) {
    if ((assignment.children.get(id) ?? []).length === 0) continue;
    for (const field of fields) if (!out.has(field)) out.set(field, id);
  }
  return out.size === 0 ? NO_FIELDS : out;
}

/** The issues of the assignment (`slot-not-accepted`, `slot-full`) on the child's annotation with a component. */
function slotIssuesOf(
  mc: MarkingComponent,
  kids: readonly DrawKid[],
  defs: readonly TypeSlot[],
  assignment: SlotAssignment,
): readonly DrawingSlotIssue[] {
  if (assignment.issues.length === 0) return NO_ISSUES;
  const annotations = new Map(kids.map((k) => [k.id, k.annotationId]));
  const names = new Map(defs.map((def) => [def.id, def.name]));
  const out: DrawingSlotIssue[] = [];
  for (const issue of assignment.issues) {
    // A child with no component annotation has nowhere to carry the issue.
    const annotationId = annotations.get(issue.childId);
    if (annotationId === undefined) continue;
    out.push({
      annotationId,
      code: issue.code,
      slot: { id: issue.slotId, name: names.get(issue.slotId) ?? issue.slotId },
      owner: mc.type.name,
      ...(issue.max === undefined ? {} : { max: issue.max }),
    });
  }
  return out.length === 0 ? NO_ISSUES : out;
}

interface DrawInput {
  readonly mc: MarkingComponent;
  readonly markingId: string;
  readonly containerId: string | null;
  readonly rect: Rect;
  readonly values: FieldValues;
  readonly valueWarnings: readonly ModelMessage[];
  /** The direct children of the marking (containers only; none with `screen`). */
  readonly kids: readonly DrawKid[];
  readonly slotDefs: readonly TypeSlot[];
  readonly measure: TextMeasurer;
  readonly mode: string | undefined;
  readonly provided: ProvidedValues;
  readonly received: Received;
  readonly density: number;
  readonly direction: ReadingDirection;
  readonly container: InstanceContainer | undefined;
  readonly anchor: DrawingAnchor | undefined;
}

interface Drawn {
  readonly drawing: ComponentDrawing;
  readonly offers: ProvidedValues | undefined;
  readonly slotClips: ReadonlyMap<string, SlotClip>;
}

/** The scene of a marking: the probe (slots empty) and, when children change it, the final drawing. */
function instantiateWithSlots(
  input: DrawInput,
  tokens: ResolvedTokens | undefined,
  space: UnitSpace,
  options: InstantiateOptions,
): { instantiated: ReturnType<typeof instantiate>; plan: SlotPlan | undefined } {
  const { mc, values, kids } = input;
  const screen = mc.component.screen !== undefined;
  const target: Rect = screen ? { x: 0, y: 0, ...mc.component.size } : space.box;
  const probe = instantiate(mc.component, values, target, options);
  // With `screen` there is no probe and no assignment (decision 6): the slot's box is not in the
  // children's space.
  if (screen || componentSlots(mc.component).length === 0)
    return { instantiated: probe, plan: undefined };
  const plan = planSlots(
    mc,
    withContainer(values, input.container),
    tokens,
    kids,
    input.slotDefs,
    space,
    probe.root,
    {
      target,
      options,
    },
  );
  if (!plan.needsFinal) return { instantiated: probe, plan };
  const instantiated = instantiate(mc.component, values, target, {
    ...options,
    slotContent: plan.content,
    filledSlots: plan.filled,
  });
  return { instantiated, plan };
}

/** What the assignment says about the slots of a drawing (empty with `screen` and without a slot). */
type SlotFacts = Pick<
  ComponentDrawing,
  'slots' | 'slotOf' | 'inactiveFields' | 'slotIssues'
>;

const NO_FACTS: SlotFacts = {
  slots: NO_SLOTS,
  slotOf: NO_SLOT_OF,
  inactiveFields: NO_FIELDS,
  slotIssues: NO_ISSUES,
};

function slotFacts(
  input: DrawInput,
  plan: SlotPlan | undefined,
  root: FrameNode,
  space: UnitSpace,
): SlotFacts {
  if (plan === undefined) return NO_FACTS;
  const { mc, kids, slotDefs } = input;
  return {
    slots: drawnSlots(mc.component, root, space, plan),
    slotOf: new Map(kids.map((k) => [k.id, plan.assignment.slotOf.get(k.id) ?? null])),
    inactiveFields: inactiveFieldsOf(mc.component, plan.assignment),
    slotIssues: slotIssuesOf(mc, kids, slotDefs, plan.assignment),
  };
}

function draw(input: DrawInput): Drawn {
  const { mc, markingId, containerId, rect, valueWarnings, received } = input;
  const { measure, mode, provided, density, direction, anchor, container } = input;
  const tokens =
    mode === undefined ? undefined : mc.component.resolvedTokensByMode?.[mode];
  const screen = mc.component.screen;
  // In screen pixels the drawing measures the component's `size`, at the origin (the canvas anchors
  // it) and does not scale with the density, just as it does not scale with the zoom.
  const space = unitSpaceOf(rect, screen === undefined ? density : 1);
  const { instantiated, plan } = instantiateWithSlots(
    input,
    tokens,
    space,
    instantiateOptions(
      markingId,
      measure,
      tokens,
      provided,
      direction,
      instanceAnchor(anchor, rect, mc.component, space.density),
      container,
    ),
  );
  const { messages, provides } = instantiated;
  const facts = slotFacts(input, plan, instantiated.root, space);
  // With `screen` the drawing may go past the marking's rectangle: there is no "does not fit"
  // pending item.
  const found =
    screen === undefined
      ? overflowsOf(
          instantiated,
          facts.slots,
          new Map(input.kids.map((k) => [k.id, k.rect])),
          space.density,
          hugAxesOf(mc.component),
        )
      : {};
  const drawing: ComponentDrawing = {
    markingId,
    containerId,
    annotationId: mc.annotation.id,
    specId: mc.specId,
    layerId: mc.annotation.layerId,
    root: withRootMatrix(instantiated.root, rect, space.density),
    warnings: [...messages, ...valueWarnings],
    overflow: Object.keys(found).length > 0,
    shortfalls: found,
    ...facts,
    ...placement(screen, rect, received),
    ...(anchor === undefined ? {} : { anchor }),
  };
  return {
    drawing,
    offers: provides,
    slotClips:
      screen === undefined ? slotClipsOf(instantiated.root, space) : NO_SLOT_CLIPS,
  };
}

const NO_KIDS: readonly DrawKid[] = [];

/** The previous clips and shapes of a slot when they equal the new ones (stable identity). */
function stableSlotClips(
  before: ReadonlyMap<string, SlotClip> | undefined,
  next: ReadonlyMap<string, SlotClip>,
): ReadonlyMap<string, SlotClip> {
  if (before === undefined || next.size === 0) return next;
  return new Map(
    [...next].map(([id, now]) => {
      const was = before.get(id);
      const same =
        was !== undefined &&
        sameRect(was.clip, now.clip) &&
        sameShapes(was.shapes, now.shapes);
      return [id, same ? was : now];
    }),
  );
}

function sameReceived(a: Received, b: Received): boolean {
  return a.hidden === b.hidden && a.clip === b.clip && a.shapes === b.shapes;
}

/**
 * Cache of a project's drawings. On each call it returns, in drawing order, one drawing per
 * marking with a component. A marking is only re-instantiated when something its drawing
 * depends on changes: the rectangle, the component (by identity), the resolved values (shallow
 * comparison), the measurer, the fonts epoch, the effective mode, density and direction, the
 * anchor (side and target rectangle; only the anchored ones depend on it) and, in containers,
 * the children (id, rectangle and type: they decide the slots); otherwise the same
 * `ComponentDrawing` comes back. The same inputs return the same `Map`.
 */
export function createDrawingCache(): DrawingCache {
  let entries = new Map<string, Entry>();
  let last: {
    p: Project | null;
    catalog: ComponentCatalog;
    measure: TextMeasurer;
    epoch: number;
    untitled: string;
    result: ComponentDrawings;
  } | null = null;

  return (p, catalog, measure, epoch, untitled = DEFAULT_LABEL_TEXTS.untitled) => {
    if (
      last !== null &&
      last.p === p &&
      last.catalog === catalog &&
      last.measure === measure &&
      last.epoch === epoch &&
      last.untitled === untitled
    ) {
      return last.result;
    }
    if (p === null) {
      entries = new Map();
      last = { p, catalog, measure, epoch, untitled, result: NO_DRAWINGS };
      return NO_DRAWINGS;
    }

    const { children, markings: markingsById } = projectIndex(p);
    const next = new Map<string, Entry>();
    const drawings = new Map<string, ComponentDrawing>();
    const components = new Map<string, MarkingComponent | null>();
    const componentOf = (id: string): MarkingComponent | null => {
      let found = components.get(id);
      if (found === undefined) {
        found = markingComponent(p, catalog, id);
        components.set(id, found);
      }
      return found;
    };
    // Inherited color: what each marking's children inherit (the parent's, with what it offers
    // on top), from top to bottom; the closest one wins and one that offers nothing is crossed.
    const scopes = new Map<string, ProvidedValues>();
    // What each marking receives from the slot of its parent that it is in (the clip goes down
    // to the grandchildren), set when the parent is drawn.
    const passed = new Map<string, Received>();
    const scopeOf = (parentId: string | null): ProvidedValues =>
      parentId === null ? NO_PROVIDED : (scopes.get(parentId) ?? NO_PROVIDED);
    for (const marking of topDown(p.markings)) {
      const inherited = scopeOf(marking.parentId);
      const mc = componentOf(marking.id);
      if (mc === null) {
        scopes.set(marking.id, inherited);
        // A plain marking has no slots, but what is under a hidden one is not drawn either.
        passHidden(
          passed,
          children.get(marking.id),
          passed.get(marking.id) ?? NOTHING_RECEIVED,
        );
        continue;
      }
      const provided = pickProvided(inherited, mc.component);
      const screen = mc.component.screen !== undefined;
      const received =
        marking.parentId === null || screen
          ? NOTHING_RECEIVED
          : (passed.get(marking.id) ?? NOTHING_RECEIVED);
      const { values, warnings: valueWarnings } = drawingValues(
        p,
        mc.annotation,
        mc.type,
        { ...DEFAULT_LABEL_TEXTS, untitled },
      );
      const kids =
        screen || componentSlots(mc.component).length === 0
          ? NO_KIDS
          : (children.get(marking.id) ?? []).map((c) => ({
              id: c.id,
              rect: c.rect,
              typeId: componentOf(c.id)?.type.id,
              annotationId: componentOf(c.id)?.annotation.id,
            }));
      // The slots of the type decide which child goes where, so they are an input of the drawing; only
      // a marking with children has an assignment.
      const slotDefs =
        kids.length === 0 ? NO_DEFS : typeSlots(p, mc.specId, mc.typeId, mc.component);
      const mode = effectiveDrawingMode(p, marking.containerId);
      const density = effectiveDensity(p, marking.containerId);
      const direction = effectiveDirection(p, marking.containerId);
      const anchor = anchorOfMarking(marking, markingsById);
      const container = readContainerOf(p, mc.component, marking.containerId);
      const before = entries.get(marking.id);
      if (
        before !== undefined &&
        before.annotationId === mc.annotation.id &&
        before.drawing.layerId === mc.annotation.layerId &&
        before.containerId === marking.containerId &&
        sameRect(before.rect, marking.rect) &&
        before.component === mc.component &&
        before.measure === measure &&
        before.epoch === epoch &&
        before.mode === mode &&
        before.density === density &&
        before.direction === direction &&
        sameContainer(before.container, container) &&
        sameAnchor(before.anchor, anchor) &&
        shallowEqual(before.values, values) &&
        before.valueWarnings.length === valueWarnings.length &&
        before.valueWarnings.every((w, i) => w.text === valueWarnings[i]?.text) &&
        sameKids(before.kids, kids) &&
        sameSlotInputs(before, slotDefs, mc.type.name) &&
        sameProvided(before.provided, provided)
      ) {
        const kept = sameReceived(before.received, received)
          ? before
          : {
              ...before,
              received,
              childReceived: childReceived(
                before.slotClips,
                before.drawing.slotOf,
                received,
                before.childReceived,
                hiddenSlotIds(before.drawing),
              ),
              drawing: withReceived(before.drawing, received),
            };
        next.set(marking.id, kept);
        drawings.set(marking.id, kept.drawing);
        scopes.set(marking.id, extendProvided(inherited, before.offers));
        for (const [id, r] of kept.childReceived) passed.set(id, r);
        passHidden(passed, children.get(marking.id), received);
        continue;
      }
      const { drawing, offers, slotClips } = draw({
        mc,
        markingId: marking.id,
        containerId: marking.containerId,
        rect: marking.rect,
        values,
        valueWarnings,
        kids,
        slotDefs,
        measure,
        mode,
        provided,
        received,
        density,
        direction,
        container,
        anchor,
      });
      const stableClips = stableSlotClips(before?.slotClips, slotClips);
      const forChildren = childReceived(
        stableClips,
        drawing.slotOf,
        received,
        before?.childReceived,
        hiddenSlotIds(drawing),
      );
      for (const [id, r] of forChildren) passed.set(id, r);
      passHidden(passed, children.get(marking.id), received);
      scopes.set(marking.id, extendProvided(inherited, offers));
      next.set(marking.id, {
        markingId: marking.id,
        containerId: marking.containerId,
        annotationId: mc.annotation.id,
        rect: marking.rect,
        component: mc.component,
        values,
        valueWarnings,
        measure,
        epoch,
        mode,
        density,
        direction,
        container,
        anchor,
        kids,
        slotDefs,
        ownerName: mc.type.name,
        provided,
        offers,
        slotClips: stableClips,
        received,
        childReceived: forChildren,
        drawing,
      });
      drawings.set(marking.id, drawing);
    }
    entries = next;

    // Nothing changed in the drawings (same objects, same order): keeps the same map.
    const previous = last?.result;
    let result: ComponentDrawings = drawings.size === 0 ? NO_DRAWINGS : drawings;
    if (previous !== undefined && previous.size === drawings.size) {
      const before = [...previous];
      const same = [...drawings].every(
        ([id, drawing], i) => before[i]?.[0] === id && before[i]?.[1] === drawing,
      );
      if (same) result = previous;
    }
    last = { p, catalog, measure, epoch, untitled, result };
    return result;
  };
}
