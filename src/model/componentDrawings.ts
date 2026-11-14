import { clippedSlotBox, findSlot, slotBoxOfScene } from './components/arrange';
import { intersectClips } from './components/box';
import type {
  ComponentFile,
  FieldValues,
  ScreenAnchor,
} from './components/componentFormat';
import {
  instantiate,
  type InstantiateOptions,
  type TextMeasurer,
} from './components/instantiate';
import type { ResolvedTokens } from './components/tokens';
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
import { anchorValues, drawingValues } from './componentValues';
import { componentAnchorDefaults } from './components/anchor';
import type { ModelMessage } from './modelMessage';
import { DEFAULT_LABEL_TEXTS } from './refs';
import { effectiveDensity, unitSpaceOf, type UnitSpace } from './density';
import { effectiveDirection } from './direction';
import { effectiveDrawingMode } from './drawingMode';
import { topDown } from './hierarchy';
import { projectIndex } from './projectIndex';
import { multiply, type FrameNode, type Matrix } from './components/scene';
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
   * The marking's anchor (v20): the stored side (absent = the component's default) and the
   * target marking's rectangle, in the same space as the `rect` (container pixels or canvas
   * units). It is what the engine reads in the `$anchor.*` pseudo-fields (R3, part 2); absent
   * without an anchor.
   */
  readonly anchor?: DrawingAnchor;
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
   * The marking's anchor (side and target rectangle); `undefined` without an anchor (decision
   * 15).
   */
  readonly anchor: DrawingAnchor | undefined;
  /** Rectangles of the direct children (containers only). */
  readonly childRects: readonly Rect[];
  /**
   * Inherited color: only the values offered by the ancestors that the component reads
   * (`$provided`).
   */
  readonly provided: ProvidedValues;
  /** What this marking's slot offers to its children (`provide`), already resolved. */
  readonly offers: ProvidedValues | undefined;
  /** The clip this marking imposes on its children (slot box with `clip`), if any. */
  readonly slotClip: Rect | undefined;
  /** The clip it receives from its parent (the parent's `childClip`, the same object). */
  readonly clip: Rect | undefined;
  /** The clip the children receive: the `slotClip` inside the received `clip` (intersection). */
  readonly childClip: Rect | undefined;
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

function sameRects(a: readonly Rect[], b: readonly Rect[]): boolean {
  return a.length === b.length && a.every((r, i) => sameRect(r, b[i] as Rect));
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

/** The same drawing with another clip from the parent (without the key when there is none). */
function withClip(drawing: ComponentDrawing, clip: Rect | undefined): ComponentDrawing {
  const copy: { -readonly [K in keyof ComponentDrawing]: ComponentDrawing[K] } = {
    ...drawing,
  };
  delete copy.clip;
  if (clip !== undefined) copy.clip = clip;
  return copy;
}

/**
 * What situates the drawing: the screen anchor (`screen`) or, otherwise, the parent's clip
 * (`clip`).
 */
function placement(
  screen: ComponentFile['screen'],
  rect: Rect,
  clip: Rect | undefined,
): Pick<ComponentDrawing, 'screen' | 'clip'> {
  if (screen !== undefined)
    return { screen: { anchor: screen.anchor ?? 'center', rect } };
  return clip === undefined ? {} : { clip };
}

/** The matrix of the scene root in units: `translate(rect.x, rect.y) · scale(density)`. */
function rootMatrix(rect: Rect, density: number): Matrix {
  return [density, 0, 0, density, rect.x, rect.y];
}

/** Key of `shortfalls` for the child that goes past the slot's box. */
export const SLOT_OVERFLOW = 'content larger than the box: slot';

/** How much the worst child goes past the slot's box (with the rounding tolerance); 0 = fits. */
function slotExcess(
  root: FrameNode,
  childRects: readonly Rect[],
  toPixels: (box: Rect) => Rect,
): number {
  const unitBox = slotBoxOfScene(root);
  if (unitBox === undefined) return 0;
  const box = toPixels(unitBox);
  let worst = 0;
  for (const r of childRects) {
    const excess = Math.max(
      box.x - SLOT_TOLERANCE - r.x,
      box.y - SLOT_TOLERANCE - r.y,
      r.x + r.width - (box.x + box.width + SLOT_TOLERANCE),
      r.y + r.height - (box.y + box.height + SLOT_TOLERANCE),
    );
    worst = Math.max(worst, excess);
  }
  return worst > 0 ? worst + SLOT_TOLERANCE : 0;
}

/**
 * The drawing's "does not fit": the engine's warning (with how much is missing) and the child
 * outside the slot.
 */
function overflowsOf(
  overflowWarnings: readonly string[],
  shortfalls: Readonly<Record<string, number>>,
  root: FrameNode,
  childRects: readonly Rect[],
  space: UnitSpace,
): Record<string, number> {
  const found: Record<string, number> = {};
  for (const w of overflowWarnings) found[w] = (shortfalls[w] ?? 0) * space.density;
  const excess = childRects.length > 0 ? slotExcess(root, childRects, space.toPixels) : 0;
  if (excess > 0) found[SLOT_OVERFLOW] = excess;
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
  return anchorValues({
    rect,
    anchorRect: anchor.rect,
    side: anchor.side,
    defaults: componentAnchorDefaults(component, density),
    density,
  });
}

/**
 * The `instantiate` options of a marking: only carries `tokens`, `provided`, `direction` and
 * `anchor` when present.
 */
function instantiateOptions(
  markingId: string,
  measure: TextMeasurer,
  tokens: ResolvedTokens | undefined,
  provided: ProvidedValues,
  direction: ReadingDirection,
  anchor: InstantiateOptions['anchor'],
): InstantiateOptions {
  return {
    measure,
    idPrefix: markingId,
    ...(tokens === undefined ? {} : { tokens }),
    ...(provided === NO_PROVIDED ? {} : { provided }),
    ...(direction === 'rtl' ? { direction } : {}),
    ...(anchor === undefined ? {} : { anchor }),
  };
}

/** The "does not fit" of an instantiated scene, in image pixels. */
function overflowsOfScene(
  instantiated: ReturnType<typeof instantiate>,
  childRects: readonly Rect[],
  space: UnitSpace,
): Record<string, number> {
  return overflowsOf(
    instantiated.overflowWarnings ?? [],
    instantiated.shortfalls ?? {},
    instantiated.root,
    childRects,
    space,
  );
}

/**
 * The clip that the slot's box imposes on the children, in image pixels (no clip with
 * `screen`).
 */
function slotClipOf(
  screen: ComponentFile['screen'],
  root: FrameNode,
  space: UnitSpace,
): Rect | undefined {
  const unitClip = screen === undefined ? clippedSlotBox(root) : undefined;
  return unitClip === undefined ? undefined : space.toPixels(unitClip);
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

function draw(
  mc: MarkingComponent,
  markingId: string,
  containerId: string | null,
  rect: Rect,
  values: FieldValues,
  valueWarnings: readonly ModelMessage[],
  childRects: readonly Rect[],
  measure: TextMeasurer,
  mode: string | undefined,
  provided: ProvidedValues,
  clip: Rect | undefined,
  density: number,
  direction: ReadingDirection,
  anchor: DrawingAnchor | undefined,
): {
  drawing: ComponentDrawing;
  offers: ProvidedValues | undefined;
  slotClip: Rect | undefined;
} {
  const tokens =
    mode === undefined ? undefined : mc.component.resolvedTokensByMode?.[mode];
  const screen = mc.component.screen;
  // In screen pixels the drawing measures the component's `size`, at the origin (the canvas anchors
  // it) and does not scale with the density, just as it does not scale with the zoom.
  const space = unitSpaceOf(rect, screen === undefined ? density : 1);
  const box: Rect =
    screen === undefined ? space.box : { x: 0, y: 0, ...mc.component.size };
  const instantiated = instantiate(
    mc.component,
    values,
    box,
    instantiateOptions(
      markingId,
      measure,
      tokens,
      provided,
      direction,
      instanceAnchor(anchor, rect, mc.component, space.density),
    ),
  );
  const { messages, provides } = instantiated;
  // With `screen` the drawing may go past the marking's rectangle: there is no "does not fit"
  // pending item.
  const found =
    screen === undefined ? overflowsOfScene(instantiated, childRects, space) : {};
  const root = withRootMatrix(instantiated.root, rect, space.density);
  const drawing: ComponentDrawing = {
    markingId,
    containerId,
    annotationId: mc.annotation.id,
    layerId: mc.annotation.layerId,
    root,
    warnings: [...messages, ...valueWarnings],
    overflow: Object.keys(found).length > 0,
    shortfalls: found,
    ...placement(screen, rect, clip),
    ...(anchor === undefined ? {} : { anchor }),
  };
  // With `screen` the scene is at the origin (screen pixels): the slot's box is not in the
  // children's space.
  const slotClip = slotClipOf(screen, instantiated.root, space);
  return { drawing, offers: provides, slotClip };
}

/**
 * Cache of a project's drawings. On each call it returns, in drawing order, one drawing per
 * marking with a component. A marking is only re-instantiated when something its drawing
 * depends on changes: the rectangle, the component (by identity), the resolved values (shallow
 * comparison), the measurer, the fonts epoch, the effective mode, density and direction, the
 * anchor (side and target rectangle; only the anchored ones depend on it) and, in containers,
 * the children's rectangles; otherwise the same `ComponentDrawing` comes back. The same inputs
 * return the same `Map`.
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
    // Inherited color: what each marking's children inherit (the parent's, with what it offers
    // on top), from top to bottom; the closest one wins and one that offers nothing is crossed.
    const scopes = new Map<string, ProvidedValues>();
    // Clip of each marking's children: the slot box with `clip` inside the clip that the marking
    // itself receives (the clip goes down to the grandchildren).
    const clips = new Map<string, Rect | undefined>();
    const scopeOf = (parentId: string | null): ProvidedValues =>
      parentId === null ? NO_PROVIDED : (scopes.get(parentId) ?? NO_PROVIDED);
    for (const marking of topDown(p.markings)) {
      const inherited = scopeOf(marking.parentId);
      const mc = markingComponent(p, catalog, marking.id);
      if (mc === null) {
        scopes.set(marking.id, inherited);
        continue;
      }
      const provided = pickProvided(inherited, mc.component);
      const clip =
        marking.parentId === null || mc.component.screen !== undefined
          ? undefined
          : clips.get(marking.parentId);
      const { values, warnings: valueWarnings } = drawingValues(
        p,
        mc.annotation,
        mc.type,
        { ...DEFAULT_LABEL_TEXTS, untitled },
      );
      const childRects =
        findSlot(mc.component) === undefined
          ? []
          : (children.get(marking.id) ?? []).map((c) => c.rect);
      const mode = effectiveDrawingMode(p, marking.containerId);
      const density = effectiveDensity(p, marking.containerId);
      const direction = effectiveDirection(p, marking.containerId);
      const anchor = anchorOfMarking(marking, markingsById);
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
        sameAnchor(before.anchor, anchor) &&
        shallowEqual(before.values, values) &&
        before.valueWarnings.length === valueWarnings.length &&
        before.valueWarnings.every((w, i) => w.text === valueWarnings[i]?.text) &&
        sameRects(before.childRects, childRects) &&
        sameProvided(before.provided, provided)
      ) {
        const kept =
          before.clip === clip
            ? before
            : {
                ...before,
                clip,
                childClip: stableRect(
                  before.childClip,
                  intersectClips(before.slotClip, clip),
                ),
                drawing: withClip(before.drawing, clip),
              };
        next.set(marking.id, kept);
        drawings.set(marking.id, kept.drawing);
        scopes.set(marking.id, extendProvided(inherited, before.offers));
        clips.set(marking.id, kept.childClip);
        continue;
      }
      const { drawing, offers, slotClip } = draw(
        mc,
        marking.id,
        marking.containerId,
        marking.rect,
        values,
        valueWarnings,
        childRects,
        measure,
        mode,
        provided,
        clip,
        density,
        direction,
        anchor,
      );
      const stableClip = stableRect(before?.slotClip, slotClip);
      const childClip = stableRect(before?.childClip, intersectClips(stableClip, clip));
      clips.set(marking.id, childClip);
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
        anchor,
        childRects,
        provided,
        offers,
        slotClip: stableClip,
        clip,
        childClip,
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
