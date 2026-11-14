import type { CornerRadius, Stroke } from './scene';

/** A straight stroke segment, in the box's local space. */
export interface SideSegment {
  readonly x1: number;
  readonly y1: number;
  readonly x2: number;
  readonly y2: number;
}

/**
 * The radius of a corner moved away by `by` px (`stroke.offset`, like CSS `outline-offset`): a
 * square corner stays square; a rounded one grows by `by`.
 */
export function growRadius(radius: CornerRadius, by: number): CornerRadius {
  if (by === 0) return radius;
  const grow = (r: number): number => (r > 0 ? r + by : 0);
  return typeof radius === 'number'
    ? grow(radius)
    : [grow(radius[0]), grow(radius[1]), grow(radius[2]), grow(radius[3])];
}

/**
 * How far the stroke line enters the box by `align`: inside, half the width; outside, half the
 * width outward (negative); centered, 0.
 */
export function strokeAlignInset(stroke: Stroke): number {
  switch (stroke.align) {
    case 'inside':
      return stroke.width / 2;
    case 'outside':
      return -stroke.width / 2;
    default:
      return 0;
  }
}

/** The radius of a shadow corner: the node's plus `spread`, never below 0 (a square corner stays square). */
export function spreadRadius(radius: CornerRadius, spread: number): CornerRadius {
  const grow = (r: number): number => (r > 0 ? Math.max(0, r + spread) : 0);
  return typeof radius === 'number'
    ? grow(radius)
    : [grow(radius[0]), grow(radius[1]), grow(radius[2]), grow(radius[3])];
}

/**
 * The stroke segments of `stroke.sides` in a `width` × `height` box: one per requested side,
 * straight end to end (no corner arc, even with `cornerRadius`), with the line shifted by
 * `align` (inside, half the width inward; outside, outward) and moved outward by `offset`.
 * Without `sides`, returns an empty list: the stroke is the outline.
 */
export function sideSegments(
  stroke: Stroke,
  width: number,
  height: number,
): SideSegment[] {
  const { sides } = stroke;
  if (!sides) return [];
  const inset = strokeAlignInset(stroke) - (stroke.offset ?? 0);
  return sides.map((side) => {
    switch (side) {
      case 'top':
        return { x1: 0, y1: inset, x2: width, y2: inset };
      case 'bottom':
        return { x1: 0, y1: height - inset, x2: width, y2: height - inset };
      case 'left':
        return { x1: inset, y1: 0, x2: inset, y2: height };
      case 'right':
        return { x1: width - inset, y1: 0, x2: width - inset, y2: height };
    }
  });
}
