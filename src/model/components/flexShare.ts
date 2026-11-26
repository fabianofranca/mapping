/**
 * The flexbox-like split of free space by weight (Arrange `weight`, `layoutScreen`): each child takes the
 * share of its weight, the one that hits its `min` or `max` freezes there and the rest is shared again.
 * The same rule as the template's `distributeFill` (`instantiate.ts`), as a pure function the layouts
 * outside the engine can call. Pure functions, no DOM.
 */

/** The smallest and largest main size a weighted child accepts (`min` > `max` takes the `min`). */
export interface ShareLimit {
  readonly min: number;
  readonly max: number;
}

const EPS = 1e-9;

function clampShare(limit: ShareLimit | undefined, size: number): number {
  return limit === undefined ? size : Math.max(limit.min, Math.min(size, limit.max));
}

/**
 * Splits `free` (never below 0) among the children: `weights[i]` is the proportion of child `i`
 * (default 1), `limits[i]` its floor and ceiling. Whoever violates a limit freezes at it (the `min`
 * first when the total violation is positive, the `max` when it is negative) and the rest is shared
 * again. Free space below the sum of the floors leaves each child at its floor.
 */
export function shareByWeight(
  limits: readonly (ShareLimit | undefined)[],
  free: number,
  weights: readonly number[] = [],
): number[] {
  const sizes = limits.map(() => 0);
  let active = limits.map((_, i) => i);
  let space = Math.max(0, free);
  while (active.length > 0) {
    const total = active.reduce((sum, i) => sum + (weights[i] ?? 1), 0);
    const rows = active.map((i) => {
      const share = (space * (weights[i] ?? 1)) / total;
      return { i, share, size: clampShare(limits[i], share) };
    });
    const violation = rows.reduce((sum, r) => sum + r.size - r.share, 0);
    const frozen = rows.filter((r) =>
      violation > 0 ? r.size > r.share : r.size < r.share,
    );
    if (Math.abs(violation) < EPS || frozen.length === 0) {
      for (const r of rows) sizes[r.i] = r.size;
      break;
    }
    for (const r of frozen) {
      sizes[r.i] = r.size;
      space = Math.max(0, space - r.size);
    }
    active = active.filter((i) => !frozen.some((r) => r.i === i));
  }
  return sizes;
}
