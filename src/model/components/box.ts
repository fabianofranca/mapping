/**
 * Rectangle in pixels (x, y, width, height): the only box type of the components. It lives
 * here, without importing the rest of the model, so the viewer package does not drag in `types.ts`.
 */
export interface Box {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/**
 * Intersection of two clips (a slot's `clip` inside another's); a missing one does not
 * clip. Boxes that do not touch give width or height 0 (clips everything).
 */
export function intersectClips(a: Box | undefined, b: Box | undefined): Box | undefined {
  if (a === undefined || b === undefined) return a ?? b;
  const x = Math.max(a.x, b.x);
  const y = Math.max(a.y, b.y);
  return {
    x,
    y,
    width: Math.max(0, Math.min(a.x + a.width, b.x + b.width) - x),
    height: Math.max(0, Math.min(a.y + a.height, b.y + b.height) - y),
  };
}
