import { bottom, clamp, right } from './geometry';
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
 * `AnchorDefaultsPx` (`components/anchor.ts`).
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
  anchor: MarkingAnchor,
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

/** The position along the side (the anchor's `start`/`center`/`end`) with the marking of `size` on that axis. */
function along(
  align: AnchorAlign,
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
 * The rectangle of the marking of size `width`×`height` snapped to `target` (same space), with no
 * bounds. The marking sits OUTSIDE the anchor, on side `side` (`start`/`end` follow `direction`: in
 * `rtl`, `start` is the right side); `align` positions along that side (on `top`/`bottom` the
 * `start` is the reading one; on the sides, `start` is the top); `offset.main` is the distance from
 * the edge (negative overlaps) and `offset.cross` moves along the side: in the reading direction on
 * `top`/`bottom` and downward on the sides. Integer (rounded).
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
