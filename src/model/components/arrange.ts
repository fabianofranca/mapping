/**
 * Component engine (Library stage): arrangement of the children of a component with a slot. A component
 * with a slot is an instance whose component has a `slot` node; the child instances (`parentId`) stay in the order
 * they appear in `screen.instances`. When the slot declares `layout` `row`/`column`, the
 * editor computes the children's rectangles and **writes** them (the file only stores absolute
 * rectangles; the layout is an editing tool). A slot without layout (or `none`) leaves the children
 * where they are. Pure functions, no DOM.
 */
import type {
  ComponentFile,
  Direction,
  Expr,
  FieldValues,
  LayoutAlign,
  LayoutJustify,
  LayoutSpec,
  LayoutWrap,
  SlotTemplate,
  TemplateNode,
} from './componentFormat';
import { evaluate, evaluateBoolean } from './expressions';
import {
  LAYOUT_ALIGNS,
  LAYOUT_JUSTIFIES,
  LAYOUT_TYPES,
  LAYOUT_WRAPS,
  NONE_ALIGNS,
  NONE_JUSTIFIES,
  allowedValue,
  justifySpacing,
  mirrorMain,
} from './layoutValues';
import {
  type Box,
  type Padding,
  type TextMeasurer,
  instantiate,
  normalizePadding,
} from './instantiate';
import type { Library, TypeDef } from './library';
import { type Instance, type Screen, childrenOf, renderOrder, updateBox } from './screen';
import { type FrameNode, absoluteBoxes, walk } from './scene';
import { applyTokens, resolveTokens } from './tokens';
import {
  alignInCell,
  placeCells,
  trackCount,
  trackOffset,
  trackSize,
} from './gridLayout';
import { TRACK_KEYS, isTrackAbsent, lineExtents, validTrack } from './gridPlan';
import { breakLines, stackLines } from './wrapLines';

/**
 * The tracks of the grid (`layout.type: "grid"`): `count` (`columns`/`rows`) or `min`
 * (`minColumnWidth`/`minRowHeight`); `vertical` fills rows (the tracks are columns),
 * `horizontal` fills columns (the tracks are rows).
 */
export interface ResolvedGrid {
  readonly count?: number | undefined;
  readonly min?: number | undefined;
  readonly orientation: 'vertical' | 'horizontal';
}

export interface ResolvedSlotLayout {
  readonly type: 'none' | 'row' | 'column' | 'grid';
  /** `grid` only: the tracks. */
  readonly grid?: ResolvedGrid | undefined;
  readonly gap: number;
  readonly padding: Padding;
  readonly align: LayoutAlign;
  readonly justify: LayoutJustify;
  /** Children in reverse order and `start` at the end (`layout.reverse`). */
  readonly reverse: boolean;
  /** Row wrap (`layout.wrap`): the lines, the space between them and the limits (v4). */
  readonly wrap: LayoutWrap;
  readonly lineGap: number;
  readonly maxPerLine?: number | undefined;
  readonly maxLines?: number | undefined;
}

const NO_LAYOUT: ResolvedSlotLayout = {
  type: 'none',
  gap: 0,
  padding: { top: 0, right: 0, bottom: 0, left: 0 },
  align: 'start',
  justify: 'start',
  reverse: false,
  wrap: 'none',
  lineGap: 0,
};

/** First `slot` node of the template (depth-first search through the frames' `children`), or none. */
export function findSlot(component: ComponentFile): SlotTemplate | undefined {
  const search = (node: TemplateNode): SlotTemplate | undefined => {
    if (node.type === 'slot') return node;
    if (node.type !== 'frame') return undefined;
    for (const child of node.children ?? []) {
      const found = search(child);
      if (found) return found;
    }
    return undefined;
  };
  return search(component.template);
}

/**
 * The component with the `$token`s replaced by its drawing's table (`resolvedTokens`, or only the
 * embedded ones), as `instantiate` does: the slot's `gap` and `padding` only apply after that.
 */
export function tokenizedComponent(component: ComponentFile): ComponentFile {
  return applyTokens(component, component.resolvedTokens ?? resolveTokens(undefined, {}));
}

/** A type is a component with a slot when its component has a slot. */
export function hasSlot(type: TypeDef | undefined): boolean {
  return type?.component !== undefined && findSlot(type.component) !== undefined;
}

function toNumber(value: unknown, fallback: number): number {
  const n = typeof value === 'number' ? value : parseFloat(String(value));
  return Number.isFinite(n) ? n : fallback;
}

/** Evaluates a closed-set expression (without a warning: falls back to the default if something outside comes in). */
function choice<T extends string>(
  expr: Expr<T> | undefined,
  allowed: readonly T[],
  fallback: T,
  values: FieldValues,
): T {
  if (expr === undefined) return fallback;
  return (
    allowedValue(evaluate<unknown>(expr as Expr<unknown>, values, fallback), allowed) ??
    fallback
  );
}

/** `maxPerLine`/`maxLines`: integer ≥ 1, or no limit. */
function limitCount(
  expr: Expr<number> | undefined,
  values: FieldValues,
): number | undefined {
  if (expr === undefined) return undefined;
  const n = toNumber(evaluate<unknown>(expr as Expr<unknown>, values, undefined), NaN);
  return Number.isInteger(n) && n >= 1 ? n : undefined;
}

/** The row wrap of the slot's layout (without `wrap`, or `none`, the other three keys do not apply). */
function resolveWrap(
  layout: LayoutSpec,
  values: FieldValues,
): Pick<ResolvedSlotLayout, 'wrap' | 'lineGap' | 'maxPerLine' | 'maxLines'> {
  const wrap = choice(layout.wrap, LAYOUT_WRAPS, 'none', values);
  if (wrap === 'none') return { wrap, lineGap: 0 };
  return {
    wrap,
    lineGap: Math.max(
      0,
      toNumber(evaluate<unknown>(layout.lineGap as Expr<unknown>, values, 0), 0),
    ),
    maxPerLine: limitCount(layout.maxPerLine, values),
    maxLines: limitCount(layout.maxLines, values),
  };
}

/** The tracks of the grid; an invalid key (or none) falls into one track of its orientation. */
function resolveGrid(layout: LayoutSpec, values: FieldValues): ResolvedGrid {
  // The first key that has a value decides (`columns` and `minColumnWidth` by expression choose
  // `Fixed` or `Adaptive` by a field); with no value in any, the first one present applies.
  const present = TRACK_KEYS.filter((entry) => layout[entry.key] !== undefined).map(
    (entry) => ({
      entry,
      value: evaluate<unknown>(layout[entry.key] as Expr<unknown>, values, undefined),
    }),
  );
  const chosen = present.find((p) => !isTrackAbsent(p.value)) ?? present[0];
  const orientation = chosen?.entry.vertical === false ? 'horizontal' : 'vertical';
  if (chosen === undefined) return { count: 1, orientation };
  const value = validTrack(chosen.entry.field, chosen.value);
  if (value === undefined) return { count: 1, orientation };
  return chosen.entry.field === 'min'
    ? { min: value, orientation }
    : { count: value, orientation };
}

/**
 * The `none` slot with `align` (vertical) and `justify` (horizontal): `start` (default), `center`, `end`
 * and `stretch`, Compose's `Box(contentAlignment)`. Without them it is the usual `none` (each child
 * stays in its own rectangle).
 */
function resolveNoneLayout(layout: LayoutSpec, values: FieldValues): ResolvedSlotLayout {
  const align = choice(layout.align, NONE_ALIGNS, 'start', values);
  const justify = choice(layout.justify, NONE_JUSTIFIES, 'start', values);
  return align === 'start' && justify === 'start'
    ? NO_LAYOUT
    : { ...NO_LAYOUT, align, justify };
}

/** The `none` slot without alignment: Arrange leaves the children where they are. */
export function isPlainNone(layout: ResolvedSlotLayout): boolean {
  return layout.type === 'none' && layout.align === 'start' && layout.justify === 'start';
}

/** Evaluates the slot's layout with the instance's values (`gap`/`padding` can be expressions). Without a layout → type 'none'. */
export function resolveSlotLayout(
  slot: SlotTemplate,
  values: FieldValues,
): ResolvedSlotLayout {
  const layout = slot.layout;
  if (!layout) return NO_LAYOUT;
  const type = choice(layout.type, LAYOUT_TYPES, 'none', values);
  if (type === 'none') return resolveNoneLayout(layout, values);
  const gap = Math.max(
    0,
    toNumber(evaluate<unknown>(layout.gap as Expr<unknown>, values, 0), 0),
  );
  const rawPadding = layout.padding
    ? evaluate<unknown>(layout.padding as Expr<unknown>, values, 0)
    : 0;
  const padding = Array.isArray(rawPadding)
    ? normalizePadding(rawPadding.map((v) => toNumber(v, 0)))
    : normalizePadding(toNumber(rawPadding, 0));
  const reverse =
    layout.reverse !== undefined && evaluateBoolean(layout.reverse, values, false);
  if (type === 'grid') {
    return {
      type,
      grid: resolveGrid(layout, values),
      gap,
      padding,
      align: choice(layout.align, NONE_ALIGNS, 'start', values),
      justify: choice(layout.justify, NONE_JUSTIFIES, 'start', values),
      reverse,
      wrap: 'none',
      lineGap: Math.max(
        0,
        toNumber(evaluate<unknown>(layout.lineGap as Expr<unknown>, values, 0), 0),
      ),
    };
  }
  // `baseline` only applies in a `row`: in a `column` it falls back to `start`, as in the engine.
  const aligns =
    type === 'row' ? LAYOUT_ALIGNS : LAYOUT_ALIGNS.filter((a) => a !== 'baseline');
  return {
    type,
    gap,
    padding,
    align: choice(layout.align, aligns, 'start', values),
    justify: choice(layout.justify, LAYOUT_JUSTIFIES, 'start', values),
    reverse,
    ...resolveWrap(layout, values),
  };
}

/** Absolute box (on screen) of an instance's slot, instantiating the component in the instance's box (in the screen's `direction`, `ltr` by default); none if the slot is invisible. */
export function slotBox(
  component: ComponentFile,
  instance: Instance,
  measure: TextMeasurer,
  direction: Direction = 'ltr',
): Box | undefined {
  const { root } = instantiate(component, instance.values, instance.box, {
    measure,
    idPrefix: instance.id,
    ...(direction === 'rtl' ? { direction } : {}),
  });
  for (const node of walk(root)) {
    if (node.type !== 'unknown' || node.sourceType !== 'slot') continue;
    // The root has `translate(box.x, box.y)`: the absolute boxes are already in screen space.
    return absoluteBoxes(root).get(node.id);
  }
  return undefined;
}

/** Absolute box of the slot in an already instantiated scene (the root carries the box's `translate`); none if the slot is invisible. */
export function slotBoxOfScene(root: FrameNode): Box | undefined {
  for (const node of walk(root)) {
    if (node.type !== 'unknown' || node.sourceType !== 'slot') continue;
    return absoluteBoxes(root).get(node.id);
  }
  return undefined;
}

/** The slot's box (first in the scene) when it has `clip`; otherwise none. */
export function clippedSlotBox(root: FrameNode): Box | undefined {
  for (const node of walk(root)) {
    if (node.type !== 'unknown' || node.sourceType !== 'slot') continue;
    return node.clipChildren === true ? slotBoxOfScene(root) : undefined;
  }
  return undefined;
}

/** Position and size on the cross axis. */
function crossAxis(
  layout: ResolvedSlotLayout,
  start: number,
  content: number,
  size: number,
): { pos: number; size: number } {
  switch (layout.align) {
    case 'center':
      return { pos: start + (content - size) / 2, size };
    case 'end':
      return { pos: start + content - size, size };
    case 'stretch':
      return { pos: start, size: Math.max(0, content) };
    default:
      return { pos: start, size };
  }
}

/** The slot's axes: where the content area starts and how large it is, on the main and cross axes. */
interface SlotGeometry {
  readonly row: boolean;
  readonly mainStart: number;
  readonly mainContent: number;
  readonly crossStart: number;
  readonly crossContent: number;
}

function slotGeometry(slot: Box, layout: ResolvedSlotLayout): SlotGeometry {
  const row = layout.type === 'row';
  const { padding } = layout;
  const contentW = slot.width - padding.left - padding.right;
  const contentH = slot.height - padding.top - padding.bottom;
  return {
    row,
    mainStart: row ? slot.x + padding.left : slot.y + padding.top,
    mainContent: row ? contentW : contentH,
    crossStart: row ? slot.y + padding.top : slot.x + padding.left,
    crossContent: row ? contentH : contentW,
  };
}

interface LayoutChild {
  readonly box: Box;
  readonly baseline?: number | undefined;
}

/** The extent of a line on the cross axis: the largest (or, with `baseline`, from the highest top to the lowest bottom). */
function lineExtent(
  layout: ResolvedSlotLayout,
  row: boolean,
  line: readonly LayoutChild[],
): number {
  const crosses = line.map((c) => (row ? c.box.height : c.box.width));
  if (layout.align !== 'baseline') return Math.max(0, ...crosses);
  const lines = line.map((c, i) => c.baseline ?? crosses[i] ?? 0);
  const above = Math.max(0, ...lines);
  return above + Math.max(0, ...crosses.map((size, i) => size - (lines[i] ?? size)));
}

/** Position and size on the cross axis of a child of a line of extent `extent` that starts at `start`. */
function crossInLine(
  layout: ResolvedSlotLayout,
  start: number,
  extent: number,
  size: number,
  baseline: { above: number; own: number } | undefined,
): { pos: number; size: number } {
  if (baseline) return { pos: start + baseline.above - baseline.own, size };
  return crossAxis(layout, start, extent, size);
}

/**
 * New (rounded) rectangles of the children, in the order of `children`. With `align: "baseline"` each
 * child brings its `baseline` (the first baseline, from the top of the box; without it the
 * bottom of the box applies) and the row aligns by the lowest one. With `wrap`, the children are split into
 * lines (what does not fit in what remains of the main axis goes to the next one, `maxPerLine` and
 * `maxLines` apply) and `justify`, `reverse`, `align` and `baseline` apply in each line; the lines
 * stack at the start of the cross axis, separated by `lineGap` (`wrap-reverse`: the reverse order).
 * Children beyond `maxLines` lines do not move (the arrangement returns the box they already had).
 */
export function layoutChildren(
  slot: Box,
  layout: ResolvedSlotLayout,
  children: readonly LayoutChild[],
  direction: Direction = 'ltr',
): Box[] {
  const boxes = layoutPhysical(slot, layout, children);
  return direction === 'rtl' ? mirrorInContent(slot, layout.padding, boxes) : boxes;
}

/**
 * In `rtl`, the already arranged boxes (as in `ltr`) mirrored inside the slot's content area
 * (`x' = left + usable width − (x − left) − w`): it applies at once to `row`, `column`,
 * `none`, grid and `wrap`, and `reverse` composes. The `padding` stays physical (the area is the same).
 */
function mirrorInContent(
  slot: Box,
  padding: ResolvedSlotLayout['padding'],
  boxes: readonly Box[],
): Box[] {
  const left = slot.x + padding.left;
  const content = slot.width - padding.left - padding.right;
  return boxes.map((b) => ({ ...b, x: Math.round(2 * left + content - b.x - b.width) }));
}

function layoutPhysical(
  slot: Box,
  layout: ResolvedSlotLayout,
  children: readonly LayoutChild[],
): Box[] {
  if (layout.type === 'grid') return layoutGrid(slot, layout, children);
  if (layout.type === 'none') return layoutOverlaid(slot, layout, children);
  const geometry = slotGeometry(slot, layout);
  const { row } = geometry;
  const wrapped = layout.wrap !== 'none';
  const mains = children.map((c) => (row ? c.box.width : c.box.height));
  const broken = wrapped
    ? breakLines(mains, geometry.mainContent, {
        gap: layout.gap,
        maxPerLine: layout.maxPerLine,
        maxLines: layout.maxLines,
      })
    : { lines: [children.map((_, i) => i)], dropped: 0 };
  const members = broken.lines.map((line) => line.map((i) => children[i] as LayoutChild));
  // Without `wrap` there is a single line, with the extent of the whole content (`center` and `end` apply to it).
  const extents = wrapped
    ? members.map((line) => lineExtent(layout, row, line))
    : [geometry.crossContent];
  const stacked = stackLines(extents, layout.lineGap, layout.wrap === 'wrap-reverse');
  const out: Box[] = children.map((c) => c.box);
  broken.lines.forEach((line, k) => {
    const place = placeLine(layout, geometry, line, children, {
      extent: extents[k] ?? 0,
      top: geometry.crossStart + (stacked.tops[k] ?? 0),
    });
    line.forEach((index, i) => (out[index] = place[i] as Box));
  });
  return out;
}

/** The children of the aligned `none` slot: each one, alone, in the slot's box (`justify` on the width, `align` on the height). */
function layoutOverlaid(
  slot: Box,
  layout: ResolvedSlotLayout,
  children: readonly LayoutChild[],
): Box[] {
  return children.map((child) => {
    const x = alignInCell(layout.justify, slot.width, child.box.width);
    const y = alignInCell(layout.align, slot.height, child.box.height);
    return roundedBox({
      x: slot.x + x.pos,
      y: slot.y + y.pos,
      width: x.size,
      height: y.size,
    });
  });
}

/**
 * The extent the children occupy in the slot, without the padding (what the `hug` of the component with a slot
 * measures): the sum with the `gap`s on the main axis and the largest extent on the cross axis (with `baseline`, from the
 * highest top to the lowest bottom). With `wrap`, the lines are split as in `layoutChildren`
 * (`available`: the main-axis space; null = only `maxPerLine` breaks): the main axis
 * measures the fullest line and the cross axis adds up the lines with the `lineGap`s.
 */
export function contentExtent(
  layout: ResolvedSlotLayout,
  children: readonly LayoutChild[],
  available: number | null,
): { width: number; height: number } {
  if (layout.type === 'grid') return gridExtent(layout, children, available);
  if (layout.type === 'none')
    return {
      width: Math.max(0, ...children.map((c) => c.box.width)),
      height: Math.max(0, ...children.map((c) => c.box.height)),
    };
  const row = layout.type === 'row';
  const mains = children.map((c) => (row ? c.box.width : c.box.height));
  const lines =
    layout.wrap === 'none'
      ? [children.map((_, i) => i)]
      : breakLines(mains, available, {
          gap: layout.gap,
          maxPerLine: layout.maxPerLine,
          maxLines: layout.maxLines,
        }).lines;
  const used = lines.map((line) =>
    Math.max(
      0,
      line.reduce((sum, i) => sum + (mains[i] ?? 0), 0) + layout.gap * (line.length - 1),
    ),
  );
  const crosses = lines.map((line) =>
    lineExtent(
      layout,
      row,
      line.map((i) => children[i] as LayoutChild),
    ),
  );
  const main = Math.max(0, ...used);
  const cross = stackLines(crosses, layout.lineGap, false).total;
  return row ? { width: main, height: cross } : { width: cross, height: main };
}

// ---------------------------------------------------------------------------------------
// Grid (`layout.type: "grid"`): each child occupies a cell
// ---------------------------------------------------------------------------------------

/** The placement of the children in the cells: the order (`reverse` inverts) and the extent of each flow line. */
interface GridPlan {
  readonly vertical: boolean;
  readonly count: number;
  /** Indices of the children in placement order. */
  readonly order: readonly number[];
  readonly cells: ReturnType<typeof placeCells>['cells'];
  /** Extent of each flow line (its largest child), on the line axis. */
  readonly extents: readonly number[];
}

const gridVertical = (layout: ResolvedSlotLayout) =>
  layout.grid?.orientation !== 'horizontal';

/** The extent of the child on the track axis (`t`) or on the flow-line axis. */
function gridSize(child: LayoutChild, vertical: boolean, onTracks: boolean): number {
  return vertical === onTracks ? child.box.width : child.box.height;
}

function planGrid(
  layout: ResolvedSlotLayout,
  children: readonly LayoutChild[],
  trackContent: number | null,
): GridPlan {
  const vertical = gridVertical(layout);
  const indices = children.map((_, i) => i);
  const order = layout.reverse ? indices.reverse() : indices;
  const count = trackCount(layout.grid ?? {}, trackContent, layout.gap);
  const { cells, lines } = placeCells(
    order.map(() => 1),
    count,
  );
  const sizes = order.map((i) => gridSize(children[i] as LayoutChild, vertical, false));
  return { vertical, count, order, cells, extents: lineExtents(cells, lines, sizes) };
}

function roundedBox(raw: Box): Box {
  return {
    x: Math.round(raw.x),
    y: Math.round(raw.y),
    width: Math.max(1, Math.round(raw.width)),
    height: Math.max(1, Math.round(raw.height)),
  };
}

/** The (rounded) rectangles of the children in the grid cells: `justify` on the tracks, `align` on the lines. */
function layoutGrid(
  slot: Box,
  layout: ResolvedSlotLayout,
  children: readonly LayoutChild[],
): Box[] {
  const vertical = gridVertical(layout);
  const { padding } = layout;
  const tStart = vertical ? slot.x + padding.left : slot.y + padding.top;
  const tContent = vertical
    ? slot.width - padding.left - padding.right
    : slot.height - padding.top - padding.bottom;
  const fStart = vertical ? slot.y + padding.top : slot.x + padding.left;
  const plan = planGrid(layout, children, tContent);
  const size = trackSize(tContent, plan.count, layout.gap);
  const stacked = stackLines(plan.extents, layout.lineGap, false);
  const out: Box[] = children.map((c) => c.box);
  for (const cell of plan.cells) {
    const index = plan.order[cell.index] as number;
    const child = children[index] as LayoutChild;
    const t = alignInCell(layout.justify, size, gridSize(child, vertical, true));
    const f = alignInCell(
      layout.align,
      plan.extents[cell.line] ?? 0,
      gridSize(child, vertical, false),
    );
    const tPos = tStart + trackOffset(cell.track, size, layout.gap) + t.pos;
    const fPos = fStart + (stacked.tops[cell.line] ?? 0) + f.pos;
    out[index] = roundedBox(
      vertical
        ? { x: tPos, y: fPos, width: t.size, height: f.size }
        : { x: fPos, y: tPos, width: f.size, height: t.size },
    );
  }
  return out;
}

/**
 * What the children ask of the grid slot (without the padding): on the track axis, `n` times the largest
 * child plus the `gap`s; on the line axis, the sum of the extents of the lines with the `lineGap`s.
 * `available`: the track-axis space (null = one track, with `minColumnWidth`).
 */
function gridExtent(
  layout: ResolvedSlotLayout,
  children: readonly LayoutChild[],
  available: number | null,
): { width: number; height: number } {
  const plan = planGrid(layout, children, available);
  const widest = Math.max(0, ...children.map((c) => gridSize(c, plan.vertical, true)));
  const tracks = plan.count * widest + layout.gap * (plan.count - 1);
  const flow = stackLines(plan.extents, layout.lineGap, false).total;
  return plan.vertical
    ? { width: tracks, height: flow }
    : { width: flow, height: tracks };
}

/** Positions on a line's main axis: `justify` over the line's slack and `reverse` mirroring it. */
function lineMainPositions(
  layout: ResolvedSlotLayout,
  geometry: SlotGeometry,
  mains: readonly number[],
): number[] {
  const total = mains.reduce((sum, s) => sum + s, 0) + layout.gap * (mains.length - 1);
  const free = Math.max(0, geometry.mainContent - total);
  const { offset, extra } = justifySpacing(layout.justify, free, mains.length);
  let cursor = geometry.mainStart + offset;
  return mains.map((main) => {
    const forward = cursor;
    cursor += main + layout.gap + extra;
    return layout.reverse
      ? mirrorMain(forward, main, geometry.mainStart, geometry.mainContent)
      : forward;
  });
}

/** The (rounded) rectangles of a line of children, given its start and extent on the cross axis. */
function placeLine(
  layout: ResolvedSlotLayout,
  geometry: SlotGeometry,
  indices: readonly number[],
  children: readonly LayoutChild[],
  cross: { extent: number; top: number },
): Box[] {
  const { row } = geometry;
  const line = indices.map((i) => children[i] as LayoutChild);
  const mains = line.map((c) => (row ? c.box.width : c.box.height));
  const positions = lineMainPositions(layout, geometry, mains);
  const lines = line.map((c) => c.baseline ?? (row ? c.box.height : c.box.width));
  const above = Math.max(0, ...lines);
  return line.map((child, i) => {
    const main = mains[i] ?? 0;
    const size = row ? child.box.height : child.box.width;
    const baseline =
      layout.align === 'baseline' ? { above, own: lines[i] ?? size } : undefined;
    const placed = crossInLine(layout, cross.top, cross.extent, size, baseline);
    const mainPos = positions[i] ?? 0;
    const raw: Box = row
      ? { x: mainPos, y: placed.pos, width: main, height: placed.size }
      : { x: placed.pos, y: mainPos, width: placed.size, height: main };
    return roundedBox(raw);
  });
}

function sameBox(a: Box, b: Box): boolean {
  return (
    Math.abs(a.x - b.x) < 0.5 &&
    Math.abs(a.y - b.y) < 0.5 &&
    Math.abs(a.width - b.width) < 0.5 &&
    Math.abs(a.height - b.height) < 0.5
  );
}

/** The first baseline of an instance's drawing (`undefined` = no text or no component). */
function instanceBaseline(
  types: ReadonlyMap<string, TypeDef>,
  child: Instance,
  measure: TextMeasurer,
  direction: Direction,
): number | undefined {
  const raw = types.get(child.typeId)?.component;
  if (!raw) return undefined;
  return instantiate(tokenizedComponent(raw), child.values, child.box, {
    measure,
    idPrefix: child.id,
    ...(direction === 'rtl' ? { direction } : {}),
  }).firstBaseline;
}

/** The targets of the children of an instance with a row/column slot, or `null` when there is nothing to arrange. */
function childTargets(
  instance: Instance,
  raw: ComponentFile | undefined,
  children: readonly Instance[],
  measure: TextMeasurer,
  types: ReadonlyMap<string, TypeDef>,
  direction: Direction,
): Box[] | null {
  if (!raw || children.length === 0) return null;
  const component = tokenizedComponent(raw);
  const slot = findSlot(component);
  if (!slot) return null;
  const layout = resolveSlotLayout(slot, instance.values);
  if (isPlainNone(layout)) return null;
  const box = slotBox(component, instance, measure, direction);
  if (!box) return null;
  const baselines =
    layout.align === 'baseline'
      ? children.map((child) => instanceBaseline(types, child, measure, direction))
      : [];
  return layoutChildren(
    box,
    layout,
    children.map((child, i) => ({ box: child.box, baseline: baselines[i] })),
    direction,
  );
}

/** Recomputes and writes the rectangles of the children of all the components with a slot with row/column layout. Pure; returns the SAME object when nothing changes. */
export function arrange(
  screen: Screen,
  library: Library,
  measure: TextMeasurer,
  direction: Direction = 'ltr',
): Screen {
  const types = new Map(library.types.map((t) => [t.id, t]));
  let current = screen;
  // Parents before children; the order is fixed at the start, the instances are reread at each step
  // (the parent may have moved the component with a slot when arranging its children).
  const ids = renderOrder(screen).map((i) => i.id);
  // Structure (parents and order of the children) does not change when arranging, only the boxes: an index by id
  // (rebuilt when a box changes); the children come from the `childrenOf` index of the original screen.
  let byId = new Map(current.instances.map((i) => [i.id, i]));
  for (const id of ids) {
    const instance = byId.get(id);
    if (!instance) continue;
    const children = childrenOf(screen, id).map((k) => byId.get(k.id) as Instance);
    const targets = childTargets(
      instance,
      types.get(instance.typeId)?.component,
      children,
      measure,
      types,
      direction,
    );
    if (!targets) continue;
    children.forEach((child, i) => {
      const target = targets[i];
      if (!target || sameBox(child.box, target)) return;
      current = updateBox(current, child.id, target);
      byId = new Map(current.instances.map((x) => [x.id, x]));
    });
  }
  return current;
}

/** Index among the siblings where a point (the dragged one's center) would fall, along the layout's axis: how many siblings (except `excludeId`) have their center before it. For 'none' it returns the end. */
export function dropIndex(
  screen: Screen,
  parentId: string,
  layout: ResolvedSlotLayout,
  point: { x: number; y: number },
  excludeId?: string,
  direction: Direction = 'ltr',
): number {
  const siblings = childrenOf(screen, parentId).filter((i) => i.id !== excludeId);
  if (layout.type === 'none') return siblings.length;
  return siblings.filter((s) => {
    const center =
      layout.type === 'row' ? s.box.x + s.box.width / 2 : s.box.y + s.box.height / 2;
    const at = layout.type === 'row' ? point.x : point.y;
    // In `reverse` the order runs from end to start: before it are the siblings after the point.
    // In a `row` in `rtl` it also inverts (the line runs to the left); the two compose.
    const backwards = layout.reverse !== (layout.type === 'row' && direction === 'rtl');
    return backwards ? center > at : center < at;
  }).length;
}
