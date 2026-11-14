/**
 * Component engine (Library stage): size-based layout (phase L2). It receives a screen **without
 * geometry** (a tree of nodes with type, values and children, plus the anchored roots) and
 * computes the rectangle of each instance from the components' sizing
 * (`sizing`: px, `fill` or `hug`). The screen is the root component, as a column. The output is
 * the neutral screen description (`Screen`), the same one the viewer and the editor draw. Pure,
 * no DOM: the text is measured by the injected `TextMeasurer`.
 *
 * Rules:
 * - Spec per axis: the component's `sizing` evaluated with the node's values (literal or, in v4,
 *   expression), or the axis's `size` (`resolveSizing`): px, `fill` or `hug`;
 *   every final size respects `minSize`; the measured `hug` rounds up to the next integer
 *   (`Math.ceil`), so the text does not wrap because of rounding. The rest stays exact.
 * - A component with a slot has a `slot`; the slot's layout (row/column/none, gap, padding,
 *   align, justify) comes from `resolveSlotLayout`. The `hug` of a component with a slot
 *   measures the arranged children (`slotContent` in `measureComponent`), so the card's height
 *   grows with the text.
 * - `fill` on the main axis of a `hug` parent has nowhere to take size from: it falls back to
 *   `hug`. In a `column` the warning is `fill inside hug: using hug`; in a `row` (width) it
 *   falls back to `hug` without a warning.
 * - The screen is a column with no padding or gap; roots without `anchor` enter it, the
 *   anchored ones stay out of the flow (with `margin` on the touched edges).
 */
import { createMessageSet, textsOf, type Params } from '../messages/collector';
import type { ModelMessageTemplateCode } from '../messages';
import type { ModelMessage } from '../modelMessage';
import { findSlot, resolveSlotLayout, type ResolvedSlotLayout } from './arrange';
import type {
  ComponentFile,
  Direction,
  FieldValues,
  IntrinsicSize,
  SlotTemplate,
} from './componentFormat';
import {
  type Box,
  type TextMeasurer,
  instantiate,
  measureComponent,
} from './instantiate';
import {
  alignInCell,
  placeCells,
  trackCount,
  trackOffset,
  trackSize,
} from './gridLayout';
import {
  intrinsicModeOf,
  isIntrinsicSize,
  justifySpacing,
  mirrorMain,
} from './layoutValues';
import { lineExtents } from './gridPlan';
import { type ResolvedSizing, resolveSizing } from './sizing';
import type { Library } from './library';
import type { Instance, Screen } from './screen';
import { absoluteBoxes, walk } from './scene';
import { breakLines, stackLines } from './wrapLines';

/** Node of the tree without geometry. */
export interface LayoutNode {
  /** Becomes the instance's id (unique on the screen). */
  readonly id: string;
  /** Id of the annotation type in the library. */
  readonly typeId: string;
  readonly values: FieldValues;
  /** They go into the component's slot, in order. */
  readonly children: readonly LayoutNode[];
}

/** Anchor of a root outside the flow, on the screen (`start`/`end` = left/right). */
export type LayoutAnchor =
  | 'top-start'
  | 'top'
  | 'top-end'
  | 'start'
  | 'center'
  | 'end'
  | 'bottom-start'
  | 'bottom'
  | 'bottom-end';

export const LAYOUT_ANCHORS: readonly LayoutAnchor[] = [
  'top-start',
  'top',
  'top-end',
  'start',
  'center',
  'end',
  'bottom-start',
  'bottom',
  'bottom-end',
];

export interface LayoutRoot {
  readonly node: LayoutNode;
  /** Absent = in the flow (the screen's column); present = outside the flow, anchored on the screen. */
  readonly anchor?: LayoutAnchor;
  /** Distance from the anchor's edges (px; default 0). Only with `anchor`. */
  readonly margin?: number;
  /**
   * Annotation type drawn beneath the root, covering the whole screen (a modal's scrim). Its
   * instance enters right before the root, with id `<root id>#scrim`.
   */
  readonly scrimTypeId?: string;
}

export interface LayoutScreen {
  readonly id: string;
  readonly name: string;
  /**
   * Reading direction of the screen (default `ltr`): in `rtl` the logical anchors
   * (`start`/`end`), the roots in the flow and the children of each slot mirror within the
   * content area (the `padding` stays physical), as in the component engine.
   */
  readonly direction?: Direction;
  readonly width: number;
  readonly height: number;
  readonly background: string;
  /** Drawing order: the first root sits at the bottom. */
  readonly roots: readonly LayoutRoot[];
}

export interface LayoutResult {
  readonly screen: Screen;
  /** `"<node id>: <message>"` (or `"screen: …"`). */
  readonly warnings: readonly string[];
  /** The same warnings with code and parameters (the node's id goes in `path`). */
  readonly messages: readonly ModelMessage[];
}

// ---------------------------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------------------------

const EPS = 0.001;

type Axis = 'width' | 'height';

/** How the width of a component without geometry is measured: the `hug` (bounded by the parent) or the intrinsic measure. */
type Mode = 'hug' | IntrinsicSize;

/** Resolved node: component, slot (if a component with a slot), slot layout and already prepared children. */
interface Prepared {
  readonly node: LayoutNode;
  readonly component: ComponentFile;
  readonly slot?: SlotTemplate;
  readonly layout: ResolvedSlotLayout;
  readonly kids: readonly Prepared[];
  /** The `sizing` evaluated with the node's values (px, `fill` or `hug` per axis). */
  readonly sizing: ResolvedSizing;
}

/** Rectangle of a child relative to the origin of the slot's content, and whether each axis came from the `hug`. */
interface KidRect {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
  /** The size is the node's `hug`, uncut: its `fill` children stay within the `hug` itself. */
  readonly hugW: boolean;
  readonly hugH: boolean;
}

interface Arranged {
  readonly rects: readonly KidRect[];
  /** Extent occupied by the children (sum with gaps on the main axis, the largest on the cross axis). */
  readonly usedW: number;
  readonly usedH: number;
}

/** The child of a `none` slot placed by `align` (vertical) and `justify` (horizontal) in the known content area. */
function alignOverlaid<R extends { x: number; y: number; w: number; h: number }>(
  rect: R,
  layout: ResolvedSlotLayout,
  cw: number | null,
  ch: number | null,
): R {
  const x =
    cw === null ? { pos: 0, size: rect.w } : alignInCell(layout.justify, cw, rect.w);
  const y =
    ch === null ? { pos: 0, size: rect.h } : alignInCell(layout.align, ch, rect.h);
  return { ...rect, x: x.pos, y: y.pos, w: x.size, h: y.size };
}

const NONE_LAYOUT: ResolvedSlotLayout = {
  type: 'none',
  gap: 0,
  padding: { top: 0, right: 0, bottom: 0, left: 0 },
  align: 'start',
  justify: 'start',
  reverse: false,
  wrap: 'none',
  lineGap: 0,
};

/** The screen is a column: no padding, no gap, children at the start. */
const SCREEN_LAYOUT: ResolvedSlotLayout = { ...NONE_LAYOUT, type: 'column' };

const sum = (values: readonly number[]) => values.reduce((total, v) => total + v, 0);
const maxOf = (values: readonly number[]) => values.reduce((m, v) => Math.max(m, v), 0);
const hugValue = (value: number) => Math.ceil(value - 1e-9);

/** Positions on the main axis (`content` null = the parent is `hug`: there is no free space). */
function mainPositions(
  sizes: readonly number[],
  gap: number,
  content: number | null,
  justify: ResolvedSlotLayout['justify'],
  reverse: boolean,
): number[] {
  const used = sum(sizes) + gap * Math.max(0, sizes.length - 1);
  const free = content === null ? 0 : Math.max(0, content - used);
  const { offset, extra } = justifySpacing(justify, free, sizes.length);
  let cursor = offset;
  return sizes.map((size) => {
    const position = cursor;
    cursor += size + gap + extra;
    return reverse ? mirrorMain(position, size, 0, content ?? used) : position;
  });
}

/**
 * Splits `free` among the `fill`s (the indices of `fixed` without a size) respecting each one's
 * `minSize`, like the instantiator's `distributeFill`: whoever does not fit in the equal share
 * freezes at its minimum and the rest is redistributed. Returns the size per index (0 where it
 * is not `fill`).
 */
function shareWithMins(
  fixed: readonly unknown[],
  mins: readonly number[],
  free: number,
): number[] {
  const sizes = fixed.map(() => 0);
  let active = fixed.flatMap((f, i) => (f === undefined ? [i] : []));
  let space = Math.max(0, free);
  for (;;) {
    const share = space / active.length;
    const frozen = active.filter((i) => (mins[i] ?? 0) > share);
    if (frozen.length === 0) {
      for (const i of active) sizes[i] = share;
      return sizes;
    }
    for (const i of frozen) space = Math.max(0, space - (sizes[i] = mins[i] ?? 0));
    active = active.filter((i) => !frozen.includes(i));
  }
}

function crossPosition(
  size: number,
  content: number,
  align: ResolvedSlotLayout['align'],
): number {
  if (align === 'center') return (content - size) / 2;
  if (align === 'end') return content - size;
  return 0;
}

const ZERO_POS = { t: 0, f: 0 };
const EMPTY_KID = { t: 0, f: 0, fFill: false, hugT: false, hugF: false };

/** The placement order of the children: the template's, or the reverse (`layout.reverse`). */
function gridOrder(count: number, reverse: boolean): number[] {
  const order = Array.from({ length: count }, (_, i) => i);
  return reverse ? order.reverse() : order;
}

/** The cells of a grid with `fs` (the extent of each child on the flow line) and the extent of each line. */
function flowCells(
  fs: readonly number[],
  count: number,
): { cells: ReturnType<typeof placeCells>['cells']; extents: number[] } {
  const { cells, lines } = placeCells(
    fs.map(() => 1),
    count,
  );
  return { cells, extents: lineExtents(cells, lines, fs) };
}

const isVerticalGrid = (layout: ResolvedSlotLayout) =>
  layout.grid?.orientation !== 'horizontal';

/**
 * The width that the children ask of a grid slot (without the padding), with each one's `widths`
 * and no known limit (`minColumnWidth` measures a track): in the vertical grid, `n` times the
 * largest; in the horizontal one, the columns (flow lines) side by side with the `lineGap`.
 */
function gridContentWidth(layout: ResolvedSlotLayout, widths: readonly number[]): number {
  const count = trackCount(layout.grid ?? {}, null, layout.gap);
  if (isVerticalGrid(layout)) return count * maxOf(widths) + layout.gap * (count - 1);
  const { extents } = flowCells(widths, count);
  return sum(extents) + layout.lineGap * Math.max(0, extents.length - 1);
}

/**
 * Position of an anchored root on an axis: `margin` at the touched edge, or centered. On the x
 * axis, `start`/`end` are logical: in `rtl`, `start` is the right edge.
 */
function anchorOffset(
  anchor: LayoutAnchor,
  axis: 'x' | 'y',
  screenSize: number,
  size: number,
  margin: number,
  dir: Direction,
): number {
  const logicalNear = anchor.endsWith('start') || anchor === 'start';
  const logicalFar = anchor.endsWith('end') || anchor === 'end';
  const flip = axis === 'x' && dir === 'rtl';
  const near =
    axis === 'x' ? (flip ? logicalFar : logicalNear) : anchor.startsWith('top');
  const far =
    axis === 'x' ? (flip ? logicalNear : logicalFar) : anchor.startsWith('bottom');
  if (near) return margin;
  if (far) return screenSize - margin - size;
  return (screenSize - size) / 2;
}

/** `{ direction: 'rtl' }` only in rtl: in ltr the key does not exist (default). */
function rtlKey(direction: Direction): { direction?: 'rtl' } {
  return direction === 'rtl' ? { direction } : {};
}

export function layoutScreen(
  input: LayoutScreen,
  library: Library,
  measure: TextMeasurer,
): LayoutResult {
  const messageSet = createMessageSet();
  const warn = (code: ModelMessageTemplateCode, params?: Params) =>
    messageSet.add(code, params);
  const types = new Map(library.types.map((t) => [t.id, t]));
  const direction: Direction = input.direction ?? 'ltr';
  /** The engine options common to every instance of this screen (the direction, above all). */
  const engine = { measure, ...rtlKey(direction) } as const;

  // --- preparation: type, component, slot and layout of each node --------------------------

  const prepare = (node: LayoutNode): Prepared | undefined => {
    const component = types.get(node.typeId)?.component;
    if (!component) {
      warn('engine.typeNoComponent', { path: node.id, typeId: node.typeId });
      return undefined;
    }
    const slot = findSlot(component);
    if (!slot && node.children.length > 0)
      warn('engine.childrenIgnored', { path: node.id });
    const kids = slot
      ? node.children.map(prepare).filter((k): k is Prepared => k !== undefined)
      : [];
    const sizing = resolveSizing(component, node.values);
    for (const m of sizing.messages) warn(m.code as ModelMessageTemplateCode, m.params);
    return {
      node,
      component,
      ...(slot ? { slot } : {}),
      layout: slot ? resolveSlotLayout(slot, node.values) : NONE_LAYOUT,
      kids,
      sizing,
    };
  };

  const specOf = (p: Prepared, axis: Axis) => p.sizing[axis].spec;
  const withMin = (p: Prepared, axis: Axis, value: number) =>
    Math.max(value, p.component.minSize?.[axis] ?? 0);
  const padW = (p: Prepared) => p.layout.padding.left + p.layout.padding.right;
  const padH = (p: Prepared) => p.layout.padding.top + p.layout.padding.bottom;

  const cache = new Map<Prepared, Map<string, number>>();
  const cached = (p: Prepared, key: string, compute: () => number): number => {
    let perNode = cache.get(p);
    if (!perNode) {
      perNode = new Map();
      cache.set(p, perNode);
    }
    const hit = perNode.get(key);
    if (hit !== undefined) return hit;
    const value = compute();
    perNode.set(key, value);
    return value;
  };

  /** Absolute box of the slot of the component instantiated in `box` (none if the slot is invisible). */
  const slotBoxOf = (
    p: Prepared,
    box: Box,
    slotContent: { width: number; height: number },
  ): Box | undefined => {
    const { root } = instantiate(p.component, p.node.values, box, {
      ...engine,
      idPrefix: p.node.id,
      slotContent,
    });
    for (const node of walk(root)) {
      if (node.type !== 'unknown' || node.sourceType !== 'slot') continue;
      return absoluteBoxes(root).get(node.id);
    }
    return undefined;
  };

  // --- intrinsic measures (hug), memoized ---------------------------------------------------

  /**
   * The width of the children (without the padding): the sum in a `row`, the largest in a
   * `column`. With `wrap`, the lines come only from `maxPerLine` (the main axis limit is not
   * known when measuring): in a `row` it is the widest line; in a `column`, the columns side
   * by side, with the `lineGap`.
   */
  const wrappedOrPlainWidth = (
    layout: ResolvedSlotLayout,
    widths: readonly number[],
    mode: Mode = 'hug',
  ): number => {
    if (layout.type === 'grid') return gridContentWidth(layout, widths);
    // `min-content` with `wrap`: the largest child (the wrap puts one per line).
    if (mode === 'min-content' && layout.type !== 'none' && layout.wrap !== 'none')
      return maxOf(widths);
    if (layout.type !== 'row' && layout.wrap === 'none') return maxOf(widths);
    if (layout.wrap === 'none')
      return sum(widths) + layout.gap * Math.max(0, widths.length - 1);
    const { lines } = breakLines(widths, null, {
      gap: layout.gap,
      maxPerLine: layout.maxPerLine,
      maxLines: layout.maxLines,
    });
    const of = (line: readonly number[]) => line.map((i) => widths[i] ?? 0);
    if (layout.type === 'row')
      return maxOf(lines.map((line) => sum(of(line)) + layout.gap * (line.length - 1)));
    return (
      sum(lines.map((line) => maxOf(of(line)))) +
      layout.lineGap * Math.max(0, lines.length - 1)
    );
  };

  /**
   * The width measure that a `sizing` asks for: the axis's `min-content`/`max-content`, else
   * the `hug` (`fill` and the rest measure as `hug`).
   */
  const widthModeOf = (spec: ReturnType<typeof specOf>): Mode =>
    intrinsicModeOf(spec) ?? 'hug';

  /** The mode of a `hug` or `fill` child: the parent's if it is `min-content`; else the `hug`. */
  const inheritedMode = (own: Mode, parent: Mode): Mode =>
    own === 'hug' && parent === 'min-content' ? parent : own;

  /**
   * Width that the arranged children ask of the slot, plus its padding. In the parent's
   * `min-content`, a `hug` or `fill` child enters with its own `min-content`; one that asks for
   * the intrinsic measure has it.
   */
  const slotContentWidth = (p: Prepared, mode: Mode = 'hug'): number =>
    cached(p, `scw|${mode}`, () => {
      const widths = p.kids.map((kid) => {
        const spec = specOf(kid, 'width');
        if (typeof spec === 'number') return withMin(kid, 'width', spec);
        const own = widthModeOf(spec);
        return intrinsicWidth(kid, inheritedMode(own, mode));
      });
      return wrappedOrPlainWidth(p.layout, widths, mode) + padW(p);
    });

  /** `hug` width (or `min-content`/`max-content`): the measured template (with `slotContent` in components with a slot). */
  function intrinsicWidth(p: Prepared, mode: Mode = 'hug'): number {
    return cached(p, `iw|${mode}`, () => {
      const options = p.slot
        ? { ...engine, slotContent: { width: slotContentWidth(p, mode), height: 0 } }
        : engine;
      const { width } = measureComponent(
        p.component,
        p.node.values,
        { width: mode === 'hug' ? null : mode, height: null },
        options,
      );
      return withMin(p, 'width', hugValue(width));
    });
  }

  /** `hug` height at the final width (`hugW`: the width also came from the `hug`). */
  function intrinsicHeight(p: Prepared, width: number, hugW: boolean): number {
    return cached(p, `ih|${width}|${hugW}`, () => {
      let slotContent = { width: 0, height: 0 };
      if (p.slot) {
        const probe = slotBoxOf(
          p,
          { x: 0, y: 0, width, height: p.component.size.height },
          { width: slotContentWidth(p), height: 0 },
        );
        if (probe) {
          const arranged = arrangeKids(
            p.kids,
            p.layout,
            hugW && p.layout.type !== 'column'
              ? null
              : Math.max(0, probe.width - padW(p)),
            null,
            false,
          );
          slotContent = { width: probe.width, height: arranged.usedH + padH(p) };
        }
      }
      const { height } = measureComponent(
        p.component,
        p.node.values,
        { width, height: null },
        p.slot ? { ...engine, slotContent } : engine,
      );
      return withMin(p, 'height', hugValue(height));
    });
  }

  // --- sizes of a child on an axis -----------------------------------------------------------

  /** Width of a child; `cw` null = the parent is `hug` in that width. */
  const widthOf = (
    kid: Prepared,
    cw: number | null,
    stretch: boolean,
  ): { w: number; hug: boolean } => {
    const spec = specOf(kid, 'width');
    if (typeof spec === 'number') return { w: withMin(kid, 'width', spec), hug: false };
    if ((spec === 'fill' || stretch) && cw !== null)
      return { w: withMin(kid, 'width', cw), hug: false };
    const mode = widthModeOf(spec);
    const intrinsic = intrinsicWidth(kid, mode);
    // `min-content`/`max-content` are not limited to the parent's space (only the `hug` shrinks down to it).
    const w = cw === null || mode !== 'hug' ? intrinsic : Math.min(intrinsic, cw);
    return { w: withMin(kid, 'width', w), hug: mode === 'hug' && w === intrinsic };
  };

  /** Natural height of a child (the `sizing`'s in px, or the `hug` at its natural width). */
  const naturalHeight = (kid: Prepared): number => {
    const spec = specOf(kid, 'height');
    if (typeof spec === 'number') return withMin(kid, 'height', spec);
    const { w, hug } = widthOf(kid, null, false);
    return intrinsicHeight(kid, w, hug);
  };

  /**
   * Arranges the children of a slot with `wrap`: it splits them into lines by natural size on
   * the main axis (the columns, in a `column`), arranges each line as a slot without `wrap` and
   * stacks the lines on the cross axis, separated by `lineGap`. Children beyond `maxLines` lines
   * have no rectangle (`rects` carries only those that stay, in order) and, in `emit`, the engine
   * warns.
   */
  function arrangeWrapped(
    kids: readonly Prepared[],
    layout: ResolvedSlotLayout,
    cw: number | null,
    ch: number | null,
    emit: boolean,
    owner: string,
  ): Arranged {
    const row = layout.type === 'row';
    const bases = kids.map((kid) =>
      row ? widthOf(kid, null, false).w : naturalHeight(kid),
    );
    const broken = breakLines(bases, row ? cw : ch, {
      gap: layout.gap,
      maxPerLine: layout.maxPerLine,
      maxLines: layout.maxLines,
    });
    if (emit && broken.dropped > 0)
      warn('engine.childrenOutsideMaxLines', { count: broken.dropped, name: owner });
    const flat: ResolvedSlotLayout = { ...layout, wrap: 'none' };
    const lines = broken.lines.map((indices) =>
      arrangeKids(
        indices.map((i) => kids[i] as Prepared),
        flat,
        row ? cw : null,
        row ? null : ch,
        emit,
        owner,
      ),
    );
    const stacked = stackLines(
      lines.map((line) => (row ? line.usedH : line.usedW)),
      layout.lineGap,
      layout.wrap === 'wrap-reverse',
    );
    const rects = lines.flatMap((line, k) =>
      line.rects.map((r) =>
        row
          ? { ...r, y: r.y + (stacked.tops[k] ?? 0) }
          : { ...r, x: r.x + (stacked.tops[k] ?? 0) },
      ),
    );
    const usedMain = maxOf(lines.map((line) => (row ? line.usedW : line.usedH)));
    return row
      ? { rects, usedW: usedMain, usedH: stacked.total }
      : { rects, usedW: stacked.total, usedH: usedMain };
  }

  // --- grade (`layout.type: "grid"`) ------------------------------------------------------

  /** The natural size of a child on the tracks axis (what the `hug` track hugs). */
  const gridNaturalTrack = (kid: Prepared, vertical: boolean): number =>
    vertical ? widthOf(kid, null, false).w : naturalHeight(kid);

  /** A measured grid child: `t` on the tracks axis, `f` (natural) on the lines axis, and whether each came from the `hug`. */
  interface GridKid {
    readonly t: number;
    readonly f: number;
    /** `f` fills the flow line (`fill`, or `align: stretch` in a `hug`). */
    readonly fFill: boolean;
    readonly hugT: boolean;
    readonly hugF: boolean;
  }

  /** Vertical grid: the width is the cell's (`size`); the height is the natural one, at the final width. */
  const verticalGridKid = (
    kid: Prepared,
    layout: ResolvedSlotLayout,
    size: number,
  ): GridKid => {
    const spec = specOf(kid, 'height');
    const w = widthOf(
      kid,
      size,
      layout.justify === 'stretch' && specOf(kid, 'width') === 'hug',
    );
    const h =
      typeof spec === 'number'
        ? withMin(kid, 'height', spec)
        : intrinsicHeight(kid, w.w, w.hug);
    const fFill = spec === 'fill' || (layout.align === 'stretch' && spec === 'hug');
    return { t: w.w, f: h, fFill, hugT: w.hug, hugF: typeof spec !== 'number' };
  };

  /** Horizontal grid: the width is the natural one (the flow line); the height is the cell's (`size`). */
  const horizontalGridKid = (
    kid: Prepared,
    layout: ResolvedSlotLayout,
    size: number,
  ): GridKid => {
    const w = widthOf(kid, null, false);
    const wSpec = specOf(kid, 'width');
    const tSpec = specOf(kid, 'height');
    const fill = tSpec === 'fill' || (layout.justify === 'stretch' && tSpec === 'hug');
    const natural =
      typeof tSpec === 'number'
        ? withMin(kid, 'height', tSpec)
        : intrinsicHeight(kid, w.w, w.hug);
    return {
      t: fill ? withMin(kid, 'height', size) : natural,
      f: w.w,
      fFill: wSpec === 'fill' || (layout.align === 'stretch' && wSpec === 'hug'),
      hugT: tSpec === 'hug' && !fill,
      hugF: w.hug,
    };
  };

  /** The rectangle of a child already placed in the cell (relative to the content origin). */
  const gridKidRect = (
    vertical: boolean,
    pos: { t: number; f: number },
    size: { t: number; f: number },
    info: GridKid,
  ): KidRect => {
    const hugF = !info.fFill && info.hugF;
    return vertical
      ? { x: pos.t, y: pos.f, w: size.t, h: size.f, hugW: info.hugT, hugH: hugF }
      : { x: pos.f, y: pos.t, w: size.f, h: size.t, hugW: hugF, hugH: info.hugT };
  };

  /** The rectangle of the child in cell `cell`: `justify` on the track, `align` on the flow line. */
  const placeGridCell = (
    layout: ResolvedSlotLayout,
    vertical: boolean,
    size: number,
    cell: { track: number },
    line: { top: number; extent: number },
    info: GridKid,
  ): KidRect => {
    const f = info.fFill ? Math.max(line.extent, info.f) : info.f;
    const alignF = layout.align === 'stretch' ? 'start' : layout.align;
    const t = layout.justify === 'stretch' && info.hugT ? size : info.t;
    const pos = {
      t:
        trackOffset(cell.track, size, layout.gap) +
        alignInCell(layout.justify, size, info.t).pos,
      f: line.top + alignInCell(alignF, line.extent, f).pos,
    };
    return gridKidRect(vertical, pos, { t, f }, info);
  };

  /** Arranges the children of a grid slot in a `cw` × `ch` content (null = the parent is `hug` on that axis). */
  function arrangeGrid(
    kids: readonly Prepared[],
    layout: ResolvedSlotLayout,
    cw: number | null,
    ch: number | null,
  ): Arranged {
    const vertical = isVerticalGrid(layout);
    const content = vertical ? cw : ch;
    const count = trackCount(layout.grid ?? {}, content, layout.gap);
    const order = gridOrder(kids.length, layout.reverse);
    const size =
      content === null
        ? maxOf(kids.map((kid) => gridNaturalTrack(kid, vertical)))
        : trackSize(content, count, layout.gap);
    const measure = vertical ? verticalGridKid : horizontalGridKid;
    const sized = order.map((i) => measure(kids[i] as Prepared, layout, size));
    const { cells, extents } = flowCells(
      sized.map((info) => info.f),
      count,
    );
    const stacked = stackLines(extents, layout.lineGap, false);
    const rects: KidRect[] = kids.map(() =>
      gridKidRect(true, ZERO_POS, ZERO_POS, EMPTY_KID),
    );
    for (const cell of cells) {
      const line = { top: stacked.tops[cell.line] ?? 0, extent: extents[cell.line] ?? 0 };
      const info = sized[cell.index] as GridKid;
      rects[order[cell.index] as number] = placeGridCell(
        layout,
        vertical,
        size,
        cell,
        line,
        info,
      );
    }
    const tracks = count * size + layout.gap * (count - 1);
    return vertical
      ? { rects, usedW: tracks, usedH: stacked.total }
      : { rects, usedW: stacked.total, usedH: tracks };
  }

  /** Arranges the children in a `cw` × `ch` content (null = the parent is `hug` on that axis). */
  function arrangeKids(
    kids: readonly Prepared[],
    layout: ResolvedSlotLayout,
    cw: number | null,
    ch: number | null,
    emit: boolean,
    owner = '',
  ): Arranged {
    return layout.type === 'grid'
      ? arrangeGrid(kids, layout, cw, ch)
      : arrangeLinear(kids, layout, cw, ch, emit, owner);
  }

  /**
   * In `rtl`, the already arranged rectangles mirrored within the content area
   * (`x' = content − x − w`): it applies at once to `row`, `column`, `none`, grid and `wrap`. The
   * slot's `padding` stays physical, because the content origin is added afterwards. In `ltr`,
   * the same ones.
   */
  const mirroredRects = (
    arranged: Arranged,
    content: number | null,
  ): readonly KidRect[] => {
    if (direction === 'ltr') return arranged.rects;
    const width = content ?? arranged.usedW;
    return arranged.rects.map((r) => ({ ...r, x: width - r.x - r.w }));
  };

  /** `arrangeKids` of `row`, `column`, `none` and of those that wrap into lines (`wrap`). */
  function arrangeLinear(
    kids: readonly Prepared[],
    layout: ResolvedSlotLayout,
    cw: number | null,
    ch: number | null,
    emit: boolean,
    owner: string,
  ): Arranged {
    if (layout.wrap !== 'none' && layout.type !== 'none')
      return arrangeWrapped(kids, layout, cw, ch, emit, owner);
    const n = kids.length;
    const gaps = layout.gap * Math.max(0, n - 1);
    const stretch = layout.align === 'stretch';

    if (layout.type === 'column') {
      const widths = kids.map((kid) =>
        widthOf(kid, cw, stretch && specOf(kid, 'width') === 'hug'),
      );
      const fixed = kids.map((kid, i) => {
        const spec = specOf(kid, 'height');
        if (typeof spec === 'number')
          return { h: withMin(kid, 'height', spec), hug: false };
        if (spec === 'hug' || isIntrinsicSize(spec) || ch === null) {
          if (spec === 'fill' && emit)
            warn('engine.fillInHugUsing', { path: kid.node.id });
          const { w, hug } = widths[i] ?? { w: 0, hug: false };
          return { h: intrinsicHeight(kid, w, hug), hug: true };
        }
        return undefined;
      });
      const fills = fixed.filter((f) => f === undefined).length;
      const taken = sum(fixed.map((f) => f?.h ?? 0));
      const shares = shareWithMins(
        fixed,
        kids.map((k) => k.component.minSize?.height ?? 0),
        fills > 0 && ch !== null ? ch - taken - gaps : 0,
      );
      const sized = kids.map((kid, i) => {
        const f = fixed[i];
        return f ?? { h: withMin(kid, 'height', shares[i] ?? 0), hug: false };
      });
      const heights = sized.map((s) => s.h);
      const usedH = sum(heights) + gaps;
      const usedW = maxOf(widths.map((x) => x.w));
      const ys = mainPositions(heights, layout.gap, ch, layout.justify, layout.reverse);
      return {
        rects: kids.map((_, i) => {
          const wi = widths[i] ?? { w: 0, hug: false };
          return {
            x: crossPosition(wi.w, cw ?? usedW, layout.align),
            y: ys[i] ?? 0,
            w: wi.w,
            h: heights[i] ?? 0,
            hugW: wi.hug,
            hugH: sized[i]?.hug ?? false,
          };
        }),
        usedW,
        usedH,
      };
    }

    if (layout.type === 'row') {
      const fixed = kids.map((kid) => {
        const spec = specOf(kid, 'width');
        if (spec === 'fill' && cw !== null) return undefined;
        return widthOf(kid, null, false);
      });
      const fills = fixed.filter((f) => f === undefined).length;
      const taken = sum(fixed.map((f) => f?.w ?? 0));
      const shares = shareWithMins(
        fixed,
        kids.map((k) => k.component.minSize?.width ?? 0),
        fills > 0 && cw !== null ? cw - taken - gaps : 0,
      );
      const widths = kids.map((kid, i) => {
        const f = fixed[i];
        return f ?? { w: withMin(kid, 'width', shares[i] ?? 0), hug: false };
      });
      // Height (cross axis): with `ch` null, the `fill`s receive the largest height of the others.
      const heightOf = (kid: Prepared, i: number): { h: number; hug: boolean } => {
        const spec = specOf(kid, 'height');
        const wi = widths[i] ?? { w: 0, hug: false };
        if (typeof spec === 'number')
          return { h: withMin(kid, 'height', spec), hug: false };
        if (ch !== null && (spec === 'fill' || stretch))
          return { h: withMin(kid, 'height', ch), hug: false };
        return { h: intrinsicHeight(kid, wi.w, wi.hug), hug: true };
      };
      const base = kids.map((kid, i) =>
        specOf(kid, 'height') === 'fill' && ch === null ? undefined : heightOf(kid, i),
      );
      const others = base.filter((b) => b !== undefined).map((b) => b.h);
      const heights = kids.map((kid, i) => {
        const b = base[i];
        if (b) return b;
        if (others.length === 0) return heightOf(kid, i);
        return { h: withMin(kid, 'height', maxOf(others)), hug: false };
      });
      const usedW = sum(widths.map((x) => x.w)) + gaps;
      const usedH = maxOf(heights.map((x) => x.h));
      const xs = mainPositions(
        widths.map((x) => x.w),
        layout.gap,
        cw,
        layout.justify,
        layout.reverse,
      );
      return {
        rects: kids.map((_, i) => {
          const wi = widths[i] ?? { w: 0, hug: false };
          const hi = heights[i] ?? { h: 0, hug: false };
          return {
            x: xs[i] ?? 0,
            y: crossPosition(hi.h, ch ?? usedH, layout.align),
            w: wi.w,
            h: hi.h,
            hugW: wi.hug,
            hugH: hi.hug,
          };
        }),
        usedW,
        usedH,
      };
    }

    // Box (`none`): each child in the content's corner, or aligned by the slot's `align`/`justify`.
    const corner = kids.map((kid) => {
      const wi = widthOf(kid, cw, false);
      const spec = specOf(kid, 'height');
      if (typeof spec === 'number')
        return {
          x: 0,
          y: 0,
          w: wi.w,
          h: withMin(kid, 'height', spec),
          hugW: wi.hug,
          hugH: false,
        };
      if (spec === 'fill' && ch !== null)
        return {
          x: 0,
          y: 0,
          w: wi.w,
          h: withMin(kid, 'height', ch),
          hugW: wi.hug,
          hugH: false,
        };
      const h = intrinsicHeight(kid, wi.w, wi.hug);
      return { x: 0, y: 0, w: wi.w, h, hugW: wi.hug, hugH: true };
    });
    const rects = corner.map((r) => alignOverlaid(r, layout, cw, ch));
    return {
      rects,
      usedW: maxOf(rects.map((r) => r.w)),
      usedH: maxOf(rects.map((r) => r.h)),
    };
  }

  // --- placement: records each instance's box and descends through the children ------------

  const place = (
    p: Prepared,
    box: Box,
    hugW: boolean,
    hugH: boolean,
    parentId: string | undefined,
    out: Instance[],
  ): void => {
    const { node } = p;
    out.push({
      id: node.id,
      typeId: node.typeId,
      box,
      values: node.values,
      ...(parentId !== undefined ? { parentId } : {}),
    });
    if (!p.slot || p.kids.length === 0) return;
    const probe = slotBoxOf(p, box, { width: slotContentWidth(p), height: 0 });
    if (!probe) {
      warn('engine.slotInvisible', { path: node.id });
      return;
    }
    const { layout } = p;
    // `hug` parent on the main axis: the `fill` children already fell back to `hug` and there is no free space.
    const cw =
      hugW && layout.type !== 'column' ? null : Math.max(0, probe.width - padW(p));
    const pre = arrangeKids(p.kids, layout, cw, null, false);
    const slot =
      slotBoxOf(p, box, { width: probe.width, height: pre.usedH + padH(p) }) ?? probe;
    const ch = hugH && layout.type !== 'row' ? null : Math.max(0, slot.height - padH(p));
    const arranged = arrangeKids(p.kids, layout, cw, ch, true, node.id);
    const rects = mirroredRects(arranged, cw);
    const originX = slot.x + layout.padding.left;
    const originY = slot.y + layout.padding.top;
    p.kids.forEach((kid, i) => {
      const r = rects[i];
      if (!r) return;
      place(
        kid,
        { x: originX + r.x, y: originY + r.y, width: r.w, height: r.h },
        r.hugW,
        r.hugH,
        node.id,
        out,
      );
    });
  };

  // --- screen --------------------------------------------------------------------------------

  const roots = input.roots
    .map((root) => ({ root, prepared: prepare(root.node) }))
    .filter(
      (r): r is { root: LayoutRoot; prepared: Prepared } => r.prepared !== undefined,
    );

  const flow = roots.filter((r) => r.root.anchor === undefined);
  const flowed = arrangeKids(
    flow.map((r) => r.prepared),
    SCREEN_LAYOUT,
    input.width,
    input.height,
    true,
  );
  if (flowed.usedH > input.height + EPS) warn('engine.screenTooTall');

  /** The roots in the flow (the screen is a column): in `rtl` mirrored within the screen's width. */
  const flowedRects = mirroredRects(flowed, input.width);

  const rootBox = (
    root: LayoutRoot,
    p: Prepared,
  ): { box: Box; hugW: boolean; hugH: boolean } => {
    const flowIndex = flow.findIndex((r) => r.prepared === p);
    const rect = flowedRects[flowIndex];
    if (root.anchor === undefined && rect)
      return {
        box: { x: rect.x, y: rect.y, width: rect.w, height: rect.h },
        hugW: rect.hugW,
        hugH: rect.hugH,
      };
    const margin = Math.max(0, root.margin ?? 0);
    const specW = specOf(p, 'width');
    const specH = specOf(p, 'height');
    const width = withMin(
      p,
      'width',
      typeof specW === 'number'
        ? specW
        : specW === 'fill'
          ? input.width - 2 * margin
          : intrinsicWidth(p, widthModeOf(specW)),
    );
    const height = withMin(
      p,
      'height',
      typeof specH === 'number'
        ? specH
        : specH === 'fill'
          ? input.height - 2 * margin
          : intrinsicHeight(p, width, specW === 'hug'),
    );
    const anchor = root.anchor ?? 'top-start';
    const x = anchorOffset(anchor, 'x', input.width, width, margin, direction);
    const y = anchorOffset(anchor, 'y', input.height, height, margin, direction);
    return {
      box: { x, y, width, height },
      hugW: specW === 'hug',
      hugH: specH === 'hug',
    };
  };

  const instances: Instance[] = [];
  for (const { root, prepared } of roots) {
    if (root.scrimTypeId !== undefined) {
      const scrim = types.get(root.scrimTypeId);
      const scrimId = `${root.node.id}#scrim`;
      if (!scrim?.component)
        warn('engine.typeNoComponent', { path: scrimId, typeId: root.scrimTypeId });
      else {
        const values: Record<string, FieldValues[string]> = {};
        for (const field of scrim.fields) values[field.key] = field.default ?? null;
        instances.push({
          id: scrimId,
          typeId: scrim.id,
          box: { x: 0, y: 0, width: input.width, height: input.height },
          values,
        });
      }
    }
    const placed = rootBox(root, prepared);
    place(prepared, placed.box, placed.hugW, placed.hugH, undefined, instances);
  }

  const messages = messageSet.list();
  return {
    screen: {
      id: input.id,
      name: input.name,
      width: input.width,
      height: input.height,
      background: input.background,
      ...rtlKey(direction),
      instances,
    },
    warnings: textsOf(messages),
    messages,
  };
}
