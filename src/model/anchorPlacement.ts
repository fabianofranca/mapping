import { bottom, clamp, right } from './geometry';
import { modelMessage, type ModelMessage } from './modelMessage';
import type {
  AnchorAlign,
  AnchorSide,
  MarkingAnchor,
  ReadingDirection,
  Rect,
} from './types';

// Geometry of the anchor snap (R3, decision 12). Pure: it receives the rectangles and returns the
// rectangle; whoever writes (`snapToAnchor`, the instance creation) lives in the other modules.

/**
 * Anchor defaults coming from the component, as the file declares them: the `offset` is in UNITS
 * (× density when used) and everything is optional. The complete pixel counterpart is
 * `ResolvedMarkingAnchor`.
 */
export interface AnchorDefaultsUnits {
  readonly side?: AnchorSide;
  readonly align?: AnchorAlign;
  readonly offset?: { readonly main: number; readonly cross: number };
}

/** The component defaults of a marking: an object or a function from whoever can read them. */
export type AnchorDefaultsSource<M> =
  AnchorDefaultsUnits | ((marking: M) => AnchorDefaultsUnits | undefined);

/** The complete anchor: side, alignment and offset in pixels of the space. */
export interface ResolvedMarkingAnchor {
  readonly side: AnchorSide;
  readonly align: AnchorAlign;
  readonly offset: { readonly main: number; readonly cross: number };
}

/** What the anchor does not state comes from the defaults (offset in units × `density`), then from `top`/`center`/0. */
export function resolveMarkingAnchor(
  anchor: Pick<MarkingAnchor, 'side' | 'align' | 'offset'>,
  defaults: AnchorDefaultsUnits | undefined,
  density: number,
): ResolvedMarkingAnchor {
  const fallback = defaults?.offset;
  return {
    side: anchor.side ?? defaults?.side ?? 'top',
    align: anchor.align ?? defaults?.align ?? 'center',
    offset:
      anchor.offset ??
      (fallback === undefined
        ? { main: 0, cross: 0 }
        : { main: fallback.main * density, cross: fallback.cross * density }),
  };
}

/** The two corner alignments (the marking's center sits on the anchor's corner). */
type CornerAlign = Extract<AnchorAlign, 'corner-start' | 'corner-end'>;

function isCorner(align: AnchorAlign): align is CornerAlign {
  return align === 'corner-start' || align === 'corner-end';
}

/** The position along the side (the anchor's `start`/`center`/`end`) with the marking of `size` on that axis. */
function along(
  align: Exclude<AnchorAlign, CornerAlign>,
  from: number,
  extent: number,
  size: number,
  reversed: boolean,
): number {
  const logical = reversed
    ? { start: 'end', center: 'center', end: 'start' }[align]
    : align;
  if (logical === 'start') return from;
  return logical === 'center' ? from + (extent - size) / 2 : from + extent - size;
}

/**
 * The corner of `target` that a `corner-*` alignment names, as the marking's CENTER, with the offset
 * applied (decision 12 of #2093). On `top`/`bottom`, `corner-start`/`corner-end` is the reading start
 * or end edge (the right one is the start in `rtl`) at the top (or bottom) edge; on `start`/`end` the
 * x is that side's edge and `corner-start`/`corner-end` is the top/bottom edge. `offset.main` moves
 * outward and `offset.cross` along the side, as in the other alignments.
 */
function cornerCenter(
  target: Rect,
  side: AnchorSide,
  align: CornerAlign,
  offset: ResolvedMarkingAnchor['offset'],
  rtl: boolean,
): { readonly x: number; readonly y: number } {
  if (side === 'top' || side === 'bottom') {
    const atStart = (align === 'corner-start') !== rtl;
    return {
      x: (atStart ? target.x : right(target)) + (rtl ? -offset.cross : offset.cross),
      y: side === 'top' ? target.y - offset.main : bottom(target) + offset.main,
    };
  }
  const left = (side === 'start') !== rtl;
  return {
    x: left ? target.x - offset.main : right(target) + offset.main,
    y: (align === 'corner-start' ? target.y : bottom(target)) + offset.cross,
  };
}

/**
 * The rectangle of the marking of size `width`×`height` snapped to `target` (same space), with no
 * bounds. The marking sits OUTSIDE the anchor, on side `side` (`start`/`end` follow `direction`: in
 * `rtl`, `start` is the right side); `align` positions along that side (on `top`/`bottom` the
 * `start` is the reading one; on the sides, `start` is the top); `offset.main` is the distance from
 * the edge (negative overlaps) and `offset.cross` moves along the side: in the reading direction on
 * `top`/`bottom` and downward on the sides. With `corner-start`/`corner-end` the marking's CENTER sits
 * on the anchor's corner (`cornerCenter`) and `offset.main` moves it outward from there. Integer (rounded).
 */
export function anchoredRect(
  target: Rect,
  size: { readonly width: number; readonly height: number },
  anchor: ResolvedMarkingAnchor,
  direction: ReadingDirection,
): Rect {
  const { side, align, offset } = anchor;
  const rtl = direction === 'rtl';
  const { width, height } = size;
  if (isCorner(align)) {
    const center = cornerCenter(target, side, align, offset, rtl);
    return {
      x: Math.round(center.x - width / 2),
      y: Math.round(center.y - height / 2),
      width,
      height,
    };
  }
  let x: number;
  let y: number;
  if (side === 'top' || side === 'bottom') {
    y = side === 'top' ? target.y - height - offset.main : bottom(target) + offset.main;
    x =
      along(align, target.x, target.width, width, rtl) +
      (rtl ? -offset.cross : offset.cross);
  } else {
    const left = (side === 'start') !== rtl;
    x = left ? target.x - width - offset.main : right(target) + offset.main;
    y = along(align, target.y, target.height, height, false) + offset.cross;
  }
  return { x: Math.round(x), y: Math.round(y), width, height };
}

/** The rectangle clamped inside `bounds` (the size does not change); `clamped` says whether it was needed. */

export function clampedInto(rect: Rect, bounds: Rect): { rect: Rect; clamped: boolean } {
  const x = clamp(rect.x, bounds.x, Math.max(bounds.x, right(bounds) - rect.width));
  const y = clamp(rect.y, bounds.y, Math.max(bounds.y, bottom(bounds) - rect.height));
  return { rect: { ...rect, x, y }, clamped: x !== rect.x || y !== rect.y };
}

/**
 * The `arrange.outside` warning: `label` does not fit in `where` (the container or parent that
 * clamped it). The one place that builds it; the code, the params and the text are fixed.
 */
export function outsideWarning(label: string, where: string): ModelMessage {
  return modelMessage(
    'arrange.outside',
    { label, where },
    `${label}: does not fit in ${where}`,
  );
}
