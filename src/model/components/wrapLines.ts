/**
 * Component engine: row wrapping (`layout.wrap`, v4). Pure functions over numbers: the
 * engine (`instantiate.ts`, the frame and the `repeat`) and the slot arrangement (`arrange.ts`,
 * `layout.ts`) use them to decide which children go on each line and where each line sits on
 * the cross axis.
 */

/** Tolerance (px) for "fits on the line": the same as the arrangement and the new child's position. */
export const WRAP_EPS = 0.001;

export interface LineBreakOptions {
  /** Gap between children of the same line. */
  readonly gap: number;
  /** Children per line, at most (`layout.maxPerLine`). */
  readonly maxPerLine?: number | undefined;
  /** Lines, at most (`layout.maxLines`): the rest is cut. */
  readonly maxLines?: number | undefined;
}

export interface BrokenLines {
  /** The indices of each line's children, in order; only the lines that stay. */
  readonly lines: readonly (readonly number[])[];
  /** How many children were left out because of `maxLines`. */
  readonly dropped: number;
}

/** Does the child fit on the current line (or is the line empty: a child larger than the line stays alone)? */
function fitsLine(
  count: number,
  used: number,
  size: number,
  available: number | null,
  options: LineBreakOptions,
): boolean {
  if (count === 0) return true;
  if (options.maxPerLine !== undefined && count >= options.maxPerLine) return false;
  return available === null || used + options.gap + size <= available + WRAP_EPS;
}

/**
 * Splits the children (by their sizes on the main axis) into lines, like `flex-wrap`: a child
 * that does not fit in what remains of `available` goes to the next line; a null `available` =
 * no limit (only `maxPerLine` wraps). Children beyond `maxLines` lines are dropped (`dropped`).
 */
export function breakLines(
  sizes: readonly number[],
  available: number | null,
  options: LineBreakOptions,
): BrokenLines {
  const all: number[][] = [];
  let current: number[] = [];
  let used = 0;
  sizes.forEach((size, index) => {
    if (!fitsLine(current.length, used, size, available, options)) {
      all.push(current);
      current = [];
      used = 0;
    }
    used += (current.length === 0 ? 0 : options.gap) + size;
    current.push(index);
  });
  if (current.length > 0) all.push(current);
  const lines = options.maxLines === undefined ? all : all.slice(0, options.maxLines);
  const dropped = all.slice(lines.length).reduce((sum, line) => sum + line.length, 0);
  return { lines, dropped };
}

export interface StackedLines {
  /** Where each line starts on the cross axis, from the start of the content area. */
  readonly tops: readonly number[];
  /** The extent occupied by the lines, including the `lineGap`s. */
  readonly total: number;
}

/**
 * Stacks the lines on the cross axis (each with its own extent), separated by `lineGap`; with
 * `reverse` (`wrap-reverse`) the line order is inverted: the first ends up at the end of the
 * block, and the new line at the start. The block starts at the start of the content area in
 * both cases.
 */
export function stackLines(
  extents: readonly number[],
  lineGap: number,
  reverse: boolean,
): StackedLines {
  const total =
    extents.reduce((sum, extent) => sum + extent, 0) +
    lineGap * Math.max(0, extents.length - 1);
  let cursor = 0;
  const tops = extents.map((extent) => {
    const top = reverse ? total - cursor - extent : cursor;
    cursor += extent + lineGap;
    return top;
  });
  return { tops, total };
}
