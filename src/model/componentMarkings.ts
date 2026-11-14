import {
  findSlot,
  resolveSlotLayout,
  slotBoxOfScene,
  type ResolvedGrid,
  type ResolvedSlotLayout,
} from './components/arrange';
import type { InstanceAnchor } from './components/anchor';
import { placeCells, trackCount, trackOffset, trackSize } from './components/gridLayout';
import { lineExtents } from './components/gridPlan';
import { WRAP_EPS, breakLines, stackLines } from './components/wrapLines';
import type { ComponentFile, FieldValues } from './components/componentFormat';
import { fitComponentSize } from './components/sizing';
import { instantiate, type TextMeasurer } from './components/instantiate';
import {
  componentFileMinSize,
  hasSlotComponent,
  markingComponent,
  type ComponentCatalog,
} from './componentCatalog';
import { anchorValues, drawingValues } from './componentValues';
import { effectiveDensity, unitSpaceOf, unitsToPixels } from './density';
import { componentForDrawing, drawOptions } from './drawingMode';
import {
  anchoredRect,
  clampedInto,
  resolveMarkingAnchor,
  type AnchorDefaultsUnits,
} from './anchorPlacement';
import { checkAnchorTarget, setNewMarkingAnchor } from './anchors';
import { effectiveDirection } from './direction';
import { fail, ModelError } from './errors';
import { modelMessage, type ModelMessage } from './modelMessage';
import {
  MIN_STORED_MARKING_SIZE,
  clamp,
  containsRect,
  imagePixelRect,
  rectsOverlap,
  right,
  bottom,
  type Size,
} from './geometry';
import {
  crowdedRectIn,
  freeRectIn,
  isFreeInLevel,
  placementLevel,
} from './freePlacement';
import { childrenOf } from './hierarchy';
import { createMarking, placeFloatingNear, type FloatingNearTarget } from './markings';
import { findById } from './project';
import { projectIndex } from './projectIndex';
import type { SpecAnnotationType } from './spec';
import { findSpecType, projectLayerFor } from './specLookup';
import { addTypedAnnotation, setFieldValue } from './typed';
import type {
  Marking,
  MarkingAnchor,
  Project,
  ProjectContainer,
  ReadingDirection,
  Rect,
  TypedValues,
} from './types';

// Creating a component instance (Library stage, B3): a marking with a typed annotation,
// at the component's initial size. Pure operation: the store makes it **one** undo
// entry. Nothing of the drawing is written (see `componentDrawings.ts`).

export interface ComponentType {
  readonly specId: string;
  readonly typeId: string;
  readonly name: string;
  /** Layer of the specialization that the type belongs to. */
  readonly layerId: string;
  /** The component has a slot that adopts child markings. */
  readonly container: boolean;
  /** The type declares `floating`: the instance is born floating, on the canvas (`formatVersion` 7). */
  readonly floating: boolean;
  readonly component: ComponentFile;
}

/**
 * Types with a component of the applied specializations, in the specialization's order (layers and
 * then types). Only the specialization whose version matches the catalog's gets in.
 */
export function componentTypes(p: Project, catalog: ComponentCatalog): ComponentType[] {
  const result: ComponentType[] = [];
  for (const applied of p.specializations) {
    const components = catalog.get(applied.id);
    if (!applied.spec || components?.version !== applied.version) continue;
    for (const layer of applied.spec.layers) {
      for (const type of layer.annotationTypes) {
        const component = components.byType.get(type.id);
        if (component === undefined) continue;
        result.push({
          specId: applied.id,
          typeId: type.id,
          name: type.name,
          layerId: layer.id,
          container: hasSlotComponent(component),
          floating: type.floating === true,
          component,
        });
      }
    }
  }
  return result;
}

export interface NewComponentArgs {
  readonly markingId: string;
  readonly annotationId: string;
  /** Container of the instance (position in its pixels); `null` = the canvas (canvas units). */
  readonly containerId: string | null;
  /**
   * **Target** component with a slot, where the instance is positioned (inside the slot); `null` = outside
   * any slot. It is only the destination of the positioning: the stored parent is always what the settle
   * decides by geometry (the smallest marking of the space that contains the instance), never the request.
   */
  readonly parentId: string | null;
  readonly specId: string;
  readonly typeId: string;
  /**
   * Desired center without a component with a slot, in the instance's space: container pixels
   * (absent = its center) or canvas units (absent = `{ x: 0, y: 0 }`). A floating
   * type only exists on the canvas: `containerId` and `parentId` null, otherwise `invalid-space`.
   */
  readonly center?: { readonly x: number; readonly y: number };
  /** Explicit rectangle (MCP), in the instance's space; absent = `componentPlacement`. */
  readonly rect?: Rect;
  /**
   * Floating type only: positions the instance in a free spot of the target's margin (container or
   * marking; `placeFloatingNear`) with the component's size. An explicit `rect` wins.
   */
  readonly near?: FloatingNearTarget;
  /**
   * Initial values on top of the component's `preview` (which is already on top of the `default`s):
   * the fields that do not come here start with the `preview`; absent = only the `preview`.
   */
  readonly values?: TypedValues;
  readonly name?: string | null;
  /**
   * Anchor (v20): the instance is linked to another marking of the same space. Without `rect`, it is born at the
   * measured size and already attached (`componentAnchoredPlacement`); with `rect`, that one rules.
   */
  readonly anchor?: MarkingAnchor;
  /** Defaults of the component's anchor (the `offset` in units) for what `anchor` does not specify. */
  readonly anchorDefaults?: AnchorDefaultsUnits;
}

interface Resolved {
  readonly component: ComponentFile;
  readonly type: SpecAnnotationType;
  readonly layerId: string;
}

function resolveType(
  p: Project,
  catalog: ComponentCatalog,
  specId: string,
  typeId: string,
): Resolved {
  const applied = projectIndex(p).specializations.get(specId);
  const components = catalog.get(specId);
  const component = components?.byType.get(typeId);
  const resolved = findSpecType(p, { specId, typeId });
  if (
    !applied ||
    components?.version !== applied.version ||
    component === undefined ||
    resolved === null
  ) {
    return fail('unknown-type', `${specId}/${typeId}`);
  }
  return { component, type: resolved.type, layerId: resolved.layer.id };
}

interface SlotBox {
  readonly area: Rect;
  readonly padding: { left: number; top: number; right: number; bottom: number };
  readonly gap: number;
  readonly flow: 'row' | 'column' | 'grid' | 'none';
  /** `grid` only: the grid's tracks. */
  readonly grid?: ResolvedGrid | undefined;
  readonly reverse: boolean;
  /** Reading direction of the slot's space: in `rtl` the grid mirrors (as in Arrange). */
  readonly direction: ReadingDirection;
  /** Row wrap of the slot (`layout.wrap`, v4) and its limits. */
  readonly wrap: 'none' | 'wrap' | 'wrap-reverse';
  readonly lineGap: number;
  readonly maxPerLine: number | undefined;
  readonly maxLines: number | undefined;
  readonly hasSlot: boolean;
}

/** The slot's layout (in units) with the measures in image pixels: padding, gap, lineGap and `grid.min`. */
function scaledLayout(layout: ResolvedSlotLayout, density: number): ResolvedSlotLayout {
  if (density === 1) return layout;
  const px = (units: number): number => units * density;
  const { padding, grid } = layout;
  return {
    ...layout,
    padding: {
      left: px(padding.left),
      top: px(padding.top),
      right: px(padding.right),
      bottom: px(padding.bottom),
    },
    gap: px(layout.gap),
    lineGap: px(layout.lineGap),
    grid:
      grid === undefined || grid.min === undefined
        ? grid
        : { ...grid, min: px(grid.min) },
  };
}

/** Slot box in whole pixels, inside the component with a slot; its rectangle if there is no slot. */
function slotArea(
  p: Project,
  catalog: ComponentCatalog,
  containerId: string,
  measure: TextMeasurer,
): SlotBox {
  const container = findById(p.markings, containerId);
  const none = { left: 0, top: 0, right: 0, bottom: 0 };
  const whole = {
    area: container.rect,
    padding: none,
    gap: 0,
    flow: 'none' as const,
    reverse: false,
    direction: 'ltr' as const,
    wrap: 'none' as const,
    lineGap: 0,
    maxPerLine: undefined,
    maxLines: undefined,
    hasSlot: false,
  };
  const mc = markingComponent(p, catalog, containerId);
  const drawn =
    mc === null ? null : componentForDrawing(p, mc.component, container.containerId);
  const slot = drawn === null ? undefined : findSlot(drawn.component);
  if (mc === null || drawn === null || slot === undefined) return whole;
  const values = drawingValues(p, mc.annotation, mc.type).values;
  const density = effectiveDensity(p, container.containerId);
  const space = unitSpaceOf(container.rect, density);
  const { root } = instantiate(drawn.component, values, space.box, {
    measure,
    idPrefix: container.id,
    ...drawOptions(drawn),
  });
  const unitBox = slotBoxOfScene(root);
  if (unitBox === undefined) return whole;
  const box = space.toPixels(unitBox);
  const x = Math.max(Math.ceil(box.x), container.rect.x);
  const y = Math.max(Math.ceil(box.y), container.rect.y);
  const r = Math.min(Math.floor(box.x + box.width), right(container.rect));
  const b = Math.min(Math.floor(box.y + box.height), bottom(container.rect));
  if (r - x < 1 || b - y < 1) return whole;
  const layout = scaledLayout(resolveSlotLayout(slot, values), density);
  return {
    area: { x, y, width: r - x, height: b - y },
    padding: layout.padding,
    gap: layout.gap,
    flow: layout.type,
    grid: layout.grid,
    // In a row in `rtl` the order runs from right to left: the children's flow inverts.
    reverse: layout.reverse !== (layout.type === 'row' && drawn.direction === 'rtl'),
    direction: drawn.direction,
    wrap: layout.wrap,
    lineGap: layout.lineGap,
    maxPerLine: layout.maxPerLine,
    maxLines: layout.maxLines,
    hasSlot: true,
  };
}

/**
 * Did the rectangle `rect` end up inside the slot area of the component with a slot `targetId` (the same
 * `slotArea` as `componentPlacement`) and, in a row or column layout, outside the last child? `false`
 * also when the target does not draw a component with a slot. Serves to know whether a new instance
 * fit or stayed stuck to the component (full slot).
 */
export function placementFitsSlot(
  p: Project,
  catalog: ComponentCatalog,
  targetId: string,
  rect: Rect,
  measure: TextMeasurer,
): boolean {
  const slot = slotArea(p, catalog, targetId, measure);
  if (!slot.hasSlot || !containsRect(slot.area, rect)) return false;
  // Row or column layout: stuck to the component, the child may be inside the slot area and still
  // on top of the last sibling (slot the size of the component): it also did not fit.
  const kids = childrenOf(p, targetId);
  // In a grid, the new child must not cover any sibling (the neighboring cells stay free).
  if (slot.flow === 'grid') return !kids.some((k) => rectsOverlap(k.rect, rect));
  const last = kids.at(-1);
  return slot.flow === 'none' || last === undefined || !rectsOverlap(last.rect, rect);
}

/** Does the target draw a component with a slot? (what `componentPlacement` uses to position the child) */
export function hasComponentSlot(
  p: Project,
  catalog: ComponentCatalog,
  targetId: string,
  measure: TextMeasurer,
): boolean {
  return slotArea(p, catalog, targetId, measure).hasSlot;
}

type PlacementArgs = Pick<
  NewComponentArgs,
  'containerId' | 'parentId' | 'specId' | 'typeId' | 'center' | 'values'
> & {
  /** Replaces the component's `size` (MCP: the `rect` of `inside`), with the same rules. */
  readonly size?: { readonly width: number; readonly height: number };
  /** The instance's anchor (`$anchor.*`) with which the size is measured; absent = no anchor. */
  readonly instanceAnchor?: InstanceAnchor;
};

/** What the placement of a new instance needs: the type, the target parent, its slot and the area. */
interface PlacementSpace {
  readonly component: ComponentFile;
  readonly type: SpecAnnotationType;
  readonly layerId: string;
  readonly floating: boolean;
  readonly image: ProjectContainer | null;
  readonly parent: Marking | null;
  readonly slot: SlotBox | null;
  /** The image or the slot's box; `null` on the canvas without a slot (no limit). */
  readonly area: Rect | null;
  /** Density of the instance's container (1 on the canvas): `size` and `minSize` are units. */
  readonly density: number;
}

function placementSpace(
  p: Project,
  catalog: ComponentCatalog,
  args: PlacementArgs,
  measure: TextMeasurer,
): PlacementSpace {
  const { component, type, layerId } = resolveType(p, catalog, args.specId, args.typeId);
  const image =
    args.containerId === null ? null : findById(p.containers, args.containerId);
  const parent = args.parentId === null ? null : findById(p.markings, args.parentId);
  if (parent !== null && parent.containerId !== args.containerId)
    fail('invalid-parent', parent.id);
  const slot = parent === null ? null : slotArea(p, catalog, parent.id, measure);
  // Without an image (canvas) and without a slot, there is no limit.
  const area: Rect | null = slot?.area ?? (image === null ? null : imagePixelRect(image));
  return {
    component,
    type,
    layerId,
    floating: type.floating === true,
    image,
    parent,
    slot,
    area,
    density: effectiveDensity(p, args.containerId),
  };
}

/** Id of the provisional marking and annotation with which the initial values are read (never written). */
const SCRATCH_MARKING = '__initial-size__';
const SCRATCH_ANNOTATION = '__initial-size-annotation__';

/**
 * The values with which the new instance is born, in the engine's form: the fields' `default`s, the component's
 * `preview` and the given `values` on top (the same order as `addComponentMarking`). They are read from a
 * provisional annotation in a throwaway project; a value the field refuses stays out (the creation,
 * later, fails with its error). `undefined` if the type's layer is not in the project.
 */
function initialValues(
  p: Project,
  space: PlacementSpace,
  args: PlacementArgs,
): FieldValues | undefined {
  const layer = projectLayerFor(p, args.specId, space.layerId);
  if (layer === null) return undefined;
  const scratch: Marking = {
    id: SCRATCH_MARKING,
    containerId: args.containerId,
    parentId: null,
    name: null,
    rect: { x: 0, y: 0, width: MIN_STORED_MARKING_SIZE, height: MIN_STORED_MARKING_SIZE },
    needsReview: false,
    locked: false,
    floating: false,
    source: null,
  };
  let next: Project = { ...p, markings: [...p.markings, scratch] };
  next = addTypedAnnotation(next, {
    id: SCRATCH_ANNOTATION,
    markingId: SCRATCH_MARKING,
    layerId: layer.id,
    type: { specId: args.specId, typeId: args.typeId },
  });
  next = applyPreview(next, SCRATCH_ANNOTATION, space.type, space.component, args.values);
  for (const [key, value] of Object.entries(args.values ?? {})) {
    try {
      next = setFieldValue(next, SCRATCH_ANNOTATION, key, value);
    } catch (error) {
      if (!(error instanceof ModelError)) throw error;
    }
  }
  const annotation = findById(next.annotations, SCRATCH_ANNOTATION);
  return drawingValues(next, annotation, space.type).values;
}

/**
 * The size the new instance wants (decision 16 of #898): the component's `size` and, on the axes where the
 * `sizing` depends on the content (`hug` or expression), the size measured with the initial values
 * (`preview` plus the given ones). Whoever gives the size (`args.size`) rules, without measuring; a component without `sizing`
 * does not measure (the common case does not pay for the provisional project), nor does a component with a slot.
 */
function wantedSize(
  p: Project,
  space: PlacementSpace,
  args: PlacementArgs,
  measure: TextMeasurer,
): Size {
  if (args.size !== undefined) return args.size;
  const { component, density } = space;
  // The component's `size` is in units; the instance is born in image pixels (× density).
  const nominal: Size = {
    width: unitsToPixels(component.size.width, density),
    height: unitsToPixels(component.size.height, density),
  };
  // Component with a slot: the content is the children, which do not exist yet (born at `size`;
  // Arrange adjusts it after they come in).
  if (component.sizing === undefined || hasSlotComponent(component)) return nominal;
  const values = initialValues(p, space, args);
  if (values === undefined) return nominal;
  const drawn = componentForDrawing(p, component, args.containerId);
  const fitted = fitComponentSize(
    drawn.component,
    values,
    { measure, ...drawOptions({ ...drawn, anchor: args.instanceAnchor }) },
    { base: component.size },
  );
  return fitted === undefined
    ? nominal
    : {
        width: unitsToPixels(fitted.width, density),
        height: unitsToPixels(fitted.height, density),
      };
}

/**
 * Size of a new instance: the component's `size` (or `args.size`) clamped to the available area
 * (the image or the slot's box of the component with a slot) and never below `minSize`; if not even the
 * minimum fits, `rect-out-of-image` (image level) or `rect-outside-parent` (component with a
 * slot). On the canvas without a slot there is no limit. It is only the size, without the search for a place: it serves whoever does not
 * need the position (the initial size and the MCP's `near`).
 */
function fitSize(space: PlacementSpace, wanted: Size): Size {
  const unitMin = space.component.minSize;
  const min = unitMin && {
    width: unitsToPixels(unitMin.width, space.density),
    height: unitsToPixels(unitMin.height, space.density),
  };
  const fit = (size: number, minimum: number, available: number): number => {
    const value = Math.max(
      Math.min(Math.round(size), available),
      minimum,
      MIN_STORED_MARKING_SIZE,
    );
    if (value > available)
      fail(space.parent === null ? 'rect-out-of-image' : 'rect-outside-parent');
    return value;
  };
  return {
    width: fit(wanted.width, min?.width ?? 0, space.area?.width ?? Infinity),
    height: fit(wanted.height, min?.height ?? 0, space.area?.height ?? Infinity),
  };
}

export function componentSize(
  p: Project,
  catalog: ComponentCatalog,
  args: Pick<
    PlacementArgs,
    | 'containerId'
    | 'parentId'
    | 'specId'
    | 'typeId'
    | 'size'
    | 'values'
    | 'instanceAnchor'
  >,
  measure: TextMeasurer,
): Size {
  const space = placementSpace(p, catalog, args, measure);
  return fitSize(space, wantedSize(p, space, args, measure));
}

/** R0 outside a slot: the size centered on `center` (default, the image center), clamped to the image. */
function centeredRect(
  space: PlacementSpace,
  size: Size,
  center?: { readonly x: number; readonly y: number },
): Rect {
  const at =
    center ??
    (space.image === null
      ? { x: 0, y: 0 }
      : { x: space.image.width / 2, y: space.image.height / 2 });
  const x = Math.round(at.x - size.width / 2);
  const y = Math.round(at.y - size.height / 2);
  const { area } = space;
  if (area === null) return { x, y, ...size };
  return {
    x: clamp(x, area.x, right(area) - size.width),
    y: clamp(y, area.y, bottom(area) - size.height),
    ...size,
  };
}

/** The axes of the slot with `wrap`: main (width in a `row`) and cross, and where the content ends. */
interface WrapAxes {
  readonly row: boolean;
  readonly start: number;
  readonly end: number;
  readonly main: (r: Rect) => number;
  readonly mainStart: (r: Rect) => number;
  readonly mainEnd: (r: Rect) => number;
  readonly crossStart: (r: Rect) => number;
  readonly crossEnd: (r: Rect) => number;
}

function wrapAxes(slot: SlotBox): WrapAxes {
  const row = slot.flow === 'row';
  const { area, padding } = slot;
  return {
    row,
    start: row ? area.x + padding.left : area.y + padding.top,
    end: row ? right(area) - padding.right : bottom(area) - padding.bottom,
    main: (r) => (row ? r.width : r.height),
    mainStart: (r) => (row ? r.x : r.y),
    mainEnd: (r) => (row ? right(r) : bottom(r)),
    crossStart: (r) => (row ? r.y : r.x),
    crossEnd: (r) => (row ? bottom(r) : right(r)),
  };
}

/** Does the new child fit after the last one on its line (main-axis space and `maxPerLine`)? */
function fitsLastLine(
  lastLine: readonly Marking[],
  slot: SlotBox,
  axes: WrapAxes,
  mainSize: number,
): boolean {
  if (slot.maxPerLine !== undefined && lastLine.length >= slot.maxPerLine) return false;
  const used =
    lastLine.reduce((sum, k) => sum + axes.main(k.rect), 0) +
    slot.gap * (lastLine.length - 1);
  return used + slot.gap + mainSize <= axes.end - axes.start + WRAP_EPS;
}

/** Where the child that follows the last one on the same line starts, on the main axis. */
function sameLineMain(
  slot: SlotBox,
  axes: WrapAxes,
  last: Rect,
  mainSize: number,
): number {
  return slot.reverse
    ? axes.mainStart(last) - slot.gap - mainSize
    : axes.mainEnd(last) + slot.gap;
}

/** Does one more line fit without going past `maxLines`? */
function canOpenLine(slot: SlotBox, lines: number): boolean {
  return slot.maxLines === undefined || lines < slot.maxLines;
}

/**
 * R0 in a slot with `wrap` and at least one child: on the last child's line, after it, if it fits (and
 * `maxPerLine` allows); otherwise at the start of the next line, below the last one (or to the right, in a
 * `column`), with the `lineGap`. The children's lines come from the same `breakLines` as the arrangement. In
 * `wrap-reverse` the new line also goes after the last one: Arrange puts the lines in the right order.
 */
function wrapSlotPoint(
  kids: readonly Marking[],
  slot: SlotBox,
  size: Size,
): { x: number; y: number } | undefined {
  const axes = wrapAxes(slot);
  const { lines } = breakLines(
    kids.map((k) => axes.main(k.rect)),
    axes.end - axes.start,
    { gap: slot.gap, maxPerLine: slot.maxPerLine },
  );
  const lastLine = (lines.at(-1) ?? []).map((i) => kids[i] as Marking);
  const lastKid = lastLine.at(-1);
  if (lastKid === undefined) return undefined;
  const mainSize = axes.row ? size.width : size.height;
  const fits = fitsLastLine(lastLine, slot, axes, mainSize);
  // A new line beyond `maxLines` would not be arranged: it follows the single-line flow.
  if (!fits && !canOpenLine(slot, lines.length)) return undefined;
  const main = fits
    ? sameLineMain(slot, axes, lastKid.rect, mainSize)
    : slot.reverse
      ? axes.end - mainSize
      : axes.start;
  const cross = fits
    ? Math.min(...lastLine.map((k) => axes.crossStart(k.rect)))
    : Math.max(...lastLine.map((k) => axes.crossEnd(k.rect))) + slot.lineGap;
  return axes.row ? { x: main, y: cross } : { x: cross, y: main };
}

/** The R0 of a slot with `wrap` (see `wrapSlotPoint`); `undefined` without `wrap`, without a layout or without children. */
function wrappedSlotRect(
  p: Project,
  parent: Marking,
  slot: SlotBox,
  size: Size,
): Rect | undefined {
  if (slot.flow === 'none' || slot.wrap === 'none') return undefined;
  const point = wrapSlotPoint(childrenOf(p, parent.id), slot, size);
  return point === undefined
    ? undefined
    : { x: Math.round(point.x), y: Math.round(point.y), ...size };
}

/** The axes of the grid: where the content area starts and how large it is on the tracks, and where the lines start. */
interface GridAxes {
  readonly vertical: boolean;
  readonly tStart: number;
  readonly tContent: number;
  readonly fStart: number;
}

function gridAxes(slot: SlotBox): GridAxes {
  const vertical = slot.grid?.orientation !== 'horizontal';
  const { area, padding } = slot;
  return {
    vertical,
    tStart: vertical ? area.x + padding.left : area.y + padding.top,
    tContent: vertical
      ? area.width - padding.left - padding.right
      : area.height - padding.top - padding.bottom,
    fStart: vertical ? area.y + padding.top : area.x + padding.left,
  };
}

/** The child's extent on the flow line (height in the vertical grid). */
const flowExtent = (axes: GridAxes, r: Rect): number =>
  axes.vertical ? r.height : r.width;

/**
 * In `rtl`, the rectangle mirrored inside the slot's content area (`x' = 2·left + usable width
 * − x − w`), as Arrange mirrors the grid (`mirrorInContent`); in `ltr`, the rectangle itself.
 */
function mirroredInSlot(slot: SlotBox, rect: Rect): Rect {
  if (slot.direction !== 'rtl') return rect;
  const left = slot.area.x + slot.padding.left;
  const content = slot.area.width - slot.padding.left - slot.padding.right;
  return { ...rect, x: Math.round(2 * left + content - rect.x - rect.width) };
}

/**
 * R0 in a grid slot: the first cell, in placement order (those of the children already there, plus the
 * first after the last line), whose rectangle, with the new child's size, does not cover any
 * sibling. The flow lines have the extent of the largest child and stack with the `lineGap`, as in
 * Arrange. `layout.reverse` does not count here: Arrange reorders afterward. In `rtl` the cell is the mirrored one
 * (the first sits at the right end), both in the search and in the overlap check.
 */
function gridSlotRect(kids: readonly Marking[], slot: SlotBox, size: Size): Rect {
  const axes = gridAxes(slot);
  const count = trackCount(slot.grid ?? {}, axes.tContent, slot.gap);
  const track = trackSize(axes.tContent, count, slot.gap);
  const { cells, lines } = placeCells(
    kids.map(() => 1),
    count,
  );
  const extents = lineExtents(
    cells,
    lines,
    kids.map((kid) => flowExtent(axes, kid.rect)),
  );
  const tops = stackLines([...extents, 0], slot.lineGap, false).tops;
  const at = (line: number, trackIndex: number): Rect => {
    const t = axes.tStart + trackOffset(trackIndex, track, slot.gap);
    const f = axes.fStart + (tops[line] ?? 0);
    const [x, y] = axes.vertical ? [t, f] : [f, t];
    return mirroredInSlot(slot, { x: Math.round(x), y: Math.round(y), ...size });
  };
  for (let line = 0; line < lines; line++) {
    for (let i = 0; i < count; i++) {
      const rect = at(line, i);
      if (!kids.some((k) => rectsOverlap(k.rect, rect))) return rect;
    }
  }
  return at(lines, 0);
}

/** R0 in a component with a slot: after the last child on the layout's axis, or at the start of the content (before the `clamp`). */
function slotRect(p: Project, parent: Marking, slot: SlotBox, size: Size): Rect {
  if (slot.flow === 'grid') return gridSlotRect(childrenOf(p, parent.id), slot, size);
  const wrapped = wrappedSlotRect(p, parent, slot, size);
  if (wrapped !== undefined) return wrapped;
  const slotBox = slot.area;
  let x = slotBox.x + slot.padding.left;
  let y = slotBox.y + slot.padding.top;
  const last = childrenOf(p, parent.id).at(-1);
  if (slot.reverse && slot.flow !== 'none') {
    // `layout.reverse`: the first child touches the end of the slot and the following ones go before the last.
    const column = slot.flow === 'column';
    const edge = column
      ? bottom(slotBox) - slot.padding.bottom
      : right(slotBox) - slot.padding.right;
    const near =
      last === undefined ? edge : (column ? last.rect.y : last.rect.x) - slot.gap;
    if (column) y = near - size.height;
    else x = near - size.width;
  } else if (last !== undefined && slot.flow === 'row') x = right(last.rect) + slot.gap;
  else if (last !== undefined && slot.flow === 'column') y = bottom(last.rect) + slot.gap;
  return { x: Math.round(x), y: Math.round(y), ...size };
}

/** No free place in the slot: the previous position (the slot's if it fits; otherwise clamped inside the component). */
function clampToParent(parent: Marking, slotBox: Rect, placed: Rect): Rect {
  if (containsRect(slotBox, placed)) return placed;
  const outer = parent.rect;
  return {
    x: clamp(placed.x, outer.x, right(outer) - placed.width),
    y: clamp(placed.y, outer.y, bottom(outer) - placed.height),
    width: placed.width,
    height: placed.height,
  };
}

/**
 * Rectangle of a new instance, in a free place (stage #1087). R0 is the previous position:
 * without a component with a slot, the component's size centered on `center` (default, the
 * image center) and clamped to the image; on the canvas (`containerId` null), centered on `center` (default
 * `{ x: 0, y: 0 }`), without a limit; in a component with a slot, inside the slot's box, right after the
 * last child on the layout's axis (row: to the right; column: below; with the slot's `gap` and `padding`;
 * with `layout.reverse`, the first at the end of the slot and the following ones before the last), or at the
 * start of the content if the layout is `none` or there are no children (before the `clamp`).
 *
 * If R0 is already free, it is the one. Otherwise it goes to the free place nearest to it (`placementLevel`:
 * inside the smallest marking that contains it and is different from it, or on the image, without covering or
 * coinciding with other markings), with the gap `PLACEMENT_GAP`. With no place in the area, it stays at R0 (clamped
 * to the component with a slot), without error. The floating type (outside the tree) returns R0 without searching.
 */
export function componentPlacement(
  p: Project,
  catalog: ComponentCatalog,
  args: PlacementArgs,
  measure: TextMeasurer,
): Rect {
  const space = placementSpace(p, catalog, args, measure);
  const size = fitSize(space, wantedSize(p, space, args, measure));
  const { parent, slot } = space;
  if (parent === null || slot === null) {
    const r0 = centeredRect(space, size, args.center);
    if (space.floating) return r0;
    return freeRectIn(placementLevel(p, args.containerId, r0), r0) ?? r0;
  }
  const placed = slotRect(p, parent, slot, size);
  const level = placementLevel(p, args.containerId, placed, { parent, area: slot.area });
  const free = freeRectIn(level, placed);
  // Full slot: the previous position, but never contained in or equal to a sibling (3.1): otherwise the settle
  // would make it a child of that one, and not of the slot's component.
  return free ?? crowdedRectIn(level, clampToParent(parent, slot.area, placed));
}

/**
 * The rectangle `rect` is free where `componentPlacement` would put it: it fits in the level's area (the image,
 * the marking that contains it or the box of the slot of `parentId`) and does not overlap any
 * non-floating marking (nor, on the canvas, any container) that crosses the area, except the parent and the ancestors.
 * It gives the test, and whoever wants to warn later, whether the chosen piece ended up free (decision 5).
 */
export function placementIsFree(
  p: Project,
  catalog: ComponentCatalog,
  args: Pick<PlacementArgs, 'containerId' | 'parentId' | 'specId' | 'typeId'> & {
    readonly rect: Rect;
  },
  measure: TextMeasurer,
): boolean {
  const { slot, parent } = placementSpace(p, catalog, args, measure);
  const target =
    parent === null || slot === null ? undefined : { parent, area: slot.area };
  return isFreeInLevel(placementLevel(p, args.containerId, args.rect, target), args.rect);
}

/** The `preview` of the field if it is a simple value; `undefined` for `table`, `ref`, absent or composite. */
function simplePreview(
  field: SpecAnnotationType['fields'][number],
  component: ComponentFile,
): string | number | null | undefined {
  if (field.type === 'table' || field.type === 'ref') return undefined;
  const preview = component.preview?.[field.key];
  // The rows of a table do not pass through here (the `table` field was already skipped).
  const simple =
    typeof preview === 'string' || typeof preview === 'number' || preview === null;
  return simple ? preview : undefined;
}

/**
 * Puts the component's `preview` into the annotation fields that `given` does not specify (the `table`
 * and `ref` fields stay at the `default`). A `preview` that the field does not accept stays at the `default`.
 */
function applyPreview(
  p: Project,
  annotationId: string,
  type: SpecAnnotationType,
  component: ComponentFile,
  given: TypedValues | undefined,
): Project {
  let next = p;
  for (const field of type.fields) {
    if (given !== undefined && field.key in given) continue;
    const preview = simplePreview(field, component);
    if (preview === undefined) continue;
    try {
      next = setFieldValue(next, annotationId, field.key, preview);
    } catch (error) {
      if (!(error instanceof ModelError)) throw error;
    }
  }
  return next;
}

/**
 * The rectangle of a new anchored instance, without creating anything (the MCP and `addComponentMarking`): the
 * measured size (`componentSize`, with the `values`) attached to the anchor (`anchoredRect`, with the
 * defaults of `anchorDefaults` and the space's density and direction), clamped to the container's image
 * with a warning (`arrange.outside`). The anchor is checked as in `setMarkingAnchor`.
 */
export function componentAnchoredPlacement(
  p: Project,
  catalog: ComponentCatalog,
  args: Pick<
    NewComponentArgs,
    | 'markingId'
    | 'containerId'
    | 'parentId'
    | 'specId'
    | 'typeId'
    | 'values'
    | 'name'
    | 'anchorDefaults'
  > & { readonly anchor: MarkingAnchor },
  measure: TextMeasurer,
): { readonly rect: Rect; readonly warnings: readonly ModelMessage[] } {
  const target = checkAnchorTarget(p, args.markingId, args.containerId, args.anchor);
  const density = effectiveDensity(p, args.containerId);
  const direction = effectiveDirection(p, args.containerId);
  const resolved = resolveMarkingAnchor(args.anchor, args.anchorDefaults, density);
  // The `$anchor.*` enters the measure (a `hug` that depends on the side measures on the branch it draws). The
  // instance's `rect` does not exist yet: `$anchor.side`, `.width` and `.height` are exact; `.x` and
  // `.y` (the anchor's center relative to the box) use the box estimated by the size WITHOUT an anchor,
  // attached as it will be. A size that depends on `.x`/`.y` may differ slightly from the drawn one
  // (`snap_to_anchor` and `fit_marking` after the creation measure with the real `rect`).
  const estimate = anchoredRect(
    target.rect,
    componentSize(p, catalog, args, measure),
    resolved,
    direction,
  );
  const instanceAnchor = anchorValues({
    rect: estimate,
    anchorRect: target.rect,
    side: resolved.side,
    defaults: { side: resolved.side },
    density,
  });
  const size = componentSize(p, catalog, { ...args, instanceAnchor }, measure);
  const wanted = anchoredRect(target.rect, size, resolved, direction);
  const container =
    args.containerId === null
      ? undefined
      : projectIndex(p).containers.get(args.containerId);
  if (container === undefined) return { rect: wanted, warnings: [] };
  const { rect, clamped } = clampedInto(wanted, imagePixelRect(container));
  if (!clamped) return { rect, warnings: [] };
  const label = args.name ?? args.markingId;
  const where = container.name ?? container.id;
  return {
    rect,
    warnings: [
      modelMessage('arrange.outside', { label, where }, `${label}: does not fit in ${where}`),
    ],
  };
}

/**
 * Creates the marking and the typed annotation that draws it, in a single operation (the store makes one
 * undo entry). `parentId` is the target component with a slot where the instance is positioned;
 * the stored parent is what the settle decides by geometry (`createMarking` settles), never the
 * request. The annotation goes in the project layer that came from the layer of the
 * type's specialization, with the component's `preview` in the fields that `args.values` does not
 * specify and the values of `args.values` on top (`table` and `ref` fields stay at the `default`). The component's minimum
 * size applies from the creation.
 */
export function addComponentMarking(
  p: Project,
  catalog: ComponentCatalog,
  args: NewComponentArgs,
  measure: TextMeasurer,
): Project {
  const { component, type, layerId } = resolveType(p, catalog, args.specId, args.typeId);
  const layer =
    projectLayerFor(p, args.specId, layerId) ?? fail('type-not-in-layer', args.typeId);
  // The anchor is checked before creating anything (the invariant's errors); after the settle, only the
  // space may have changed and then it is released (`setNewMarkingAnchor`).
  if (args.anchor) checkAnchorTarget(p, args.markingId, args.containerId, args.anchor);
  // Floating type (decision 10): a floating marking is born on the canvas, outside the belonging.
  const floating = type.floating === true;
  const defaultSize = (): Size =>
    componentSize(
      p,
      catalog,
      {
        containerId: null,
        parentId: null,
        specId: args.specId,
        typeId: args.typeId,
        ...(args.values ? { values: args.values } : {}),
      },
      measure,
    );
  if (floating && (args.containerId !== null || args.parentId !== null)) {
    fail('invalid-space', args.typeId);
  }
  const near = floating && args.near && !args.rect ? args.near : null;
  const rect =
    args.rect ??
    (args.anchor
      ? componentAnchoredPlacement(p, catalog, { ...args, anchor: args.anchor }, measure)
          .rect
      : null) ??
    (near ? placeFloatingNear(p, near, defaultSize()) : null) ??
    componentPlacement(
      p,
      catalog,
      {
        containerId: args.containerId,
        parentId: args.parentId,
        specId: args.specId,
        typeId: args.typeId,
        ...(args.center ? { center: args.center } : {}),
        ...(args.values ? { values: args.values } : {}),
      },
      measure,
    );
  if (args.parentId !== null) {
    const parent = findById(p.markings, args.parentId);
    if (parent.containerId !== args.containerId) fail('invalid-parent', parent.id);
    if (!containsRect(parent.rect, rect)) fail('rect-outside-parent');
  }

  let next = createMarking(
    p,
    {
      id: args.markingId,
      containerId: args.containerId,
      rect,
      ...(args.name !== undefined ? { name: args.name } : {}),
      ...(floating ? { floating: true } : {}),
    },
    {
      minSize: componentFileMinSize(component, effectiveDensity(p, args.containerId)),
    },
  );
  next = addTypedAnnotation(next, {
    id: args.annotationId,
    markingId: args.markingId,
    layerId: layer.id,
    type: { specId: args.specId, typeId: args.typeId },
  });

  next = applyPreview(next, args.annotationId, type, component, args.values);
  for (const [key, value] of Object.entries(args.values ?? {})) {
    next = setFieldValue(next, args.annotationId, key, value);
  }
  // The settle may have put the new one in a different space than the target: the anchor is released, the creation does not fail.
  return args.anchor ? setNewMarkingAnchor(next, args.markingId, args.anchor) : next;
}
