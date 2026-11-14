import type { Rect } from './types';

// Spatial index of a space (#882, decision 4): given a rectangle, it returns, without scanning
// the whole space, the markings that may contain it. Pure (no browser API), for the model and
// the MCP.
//
// Structure: a grid whose resolution depends on the size. Each rectangle `R` falls into a class
// `(ex, ey)` by the powers of two `2^ex ≥ width` and `2^ey ≥ height`, and into a cell `(cx, cy)`
// by its top-left corner (`floor(x / 2^ex)`). Whatever contains a rectangle `r` contains the
// point `(r.x, r.y)`, and the width of `R` fits in a cell, so `cx` lies between
// `floor(r.x / 2^ex) - 1` and `floor(r.x / 2^ex)`: per class only a few cells are looked at
// (2 to 4 per axis). The cost of a query is the number of size classes present plus the number
// of markings that share those cells with the point.
//
// Degenerate case (it stays quadratic, and this is said on purpose): many huge markings that
// cover all the others, or rectangles that do not fit in the grid (width or height ≤ 0, not
// finite, or too tiny), go to the "loose" list, which every query walks in full.

const MIN_EXP = -10;
const MAX_EXP = 40;
/** Cell coordinates with a magnitude below this fit in the numeric key; the rest go to the loose list. */
const CELL_LIMIT = 2 ** 24;
const CELL_SHIFT = 2 ** 25;
const CELL_STRIDE = 2 ** 26;

interface SizeClass {
  readonly sx: number;
  readonly sy: number;
  /** Cell key → positions of the items (in ascending order). */
  readonly cells: Map<number, number[]>;
}

export interface RectIndex<T> {
  /**
   * A superset, in the order they were given, of the items whose rectangle contains `inner` with
   * the tolerance `slack` (`containsRect` with `slack` 0, `containsRectApprox` with its
   * tolerance). The caller checks the exact predicate; the index only prunes what is far away.
   */
  readonly containing: (inner: Rect, slack?: number) => T[];
}

const cellKey = (cx: number, cy: number): number =>
  (cx + CELL_SHIFT) * CELL_STRIDE + (cy + CELL_SHIFT);

/** Smallest exponent `e` with `2^e ≥ size`, or `null` if `size` does not fit in the grid. */
function exponentOf(size: number): number | null {
  if (!(size > 0) || !Number.isFinite(size)) return null;
  let e = Math.ceil(Math.log2(size));
  if (2 ** e < size) e++;
  return e >= MIN_EXP && e <= MAX_EXP ? e : null;
}

/** The class and cell of `r`, or `null` (goes to the loose list). */
function placeOf(r: Rect): { ex: number; ey: number; cx: number; cy: number } | null {
  const ex = exponentOf(r.width);
  const ey = exponentOf(r.height);
  if (ex === null || ey === null) return null;
  const cx = Math.floor(r.x / 2 ** ex);
  const cy = Math.floor(r.y / 2 ** ey);
  const fits = Math.abs(cx) < CELL_LIMIT && Math.abs(cy) < CELL_LIMIT;
  return fits ? { ex, ey, cx, cy } : null;
}

/** Builds the index of `items`; the position in `items` is the order of the answers. */
export function buildRectIndex<T>(
  items: readonly T[],
  rectOf: (item: T) => Rect,
): RectIndex<T> {
  const classes = new Map<number, SizeClass>();
  const loose: number[] = [];
  items.forEach((item, pos) => {
    const place = placeOf(rectOf(item));
    if (place === null) {
      loose.push(pos);
      return;
    }
    const id = place.ex * 128 + place.ey;
    let cls = classes.get(id);
    if (!cls) {
      cls = { sx: 2 ** place.ex, sy: 2 ** place.ey, cells: new Map() };
      classes.set(id, cls);
    }
    const key = cellKey(place.cx, place.cy);
    const cell = cls.cells.get(key);
    if (cell) cell.push(pos);
    else cls.cells.set(key, [pos]);
  });
  const sizeClasses = [...classes.values()];

  const containing = (inner: Rect, slack = 0): T[] => {
    // Invalid rectangle (negative width or height, NaN): no pruning possible.
    if (
      !(inner.width >= 0) ||
      !(inner.height >= 0) ||
      !Number.isFinite(inner.x + inner.y)
    ) {
      return items.slice();
    }
    const found = [...loose];
    const padX = slack + 1e-9 * (1 + Math.abs(inner.x));
    const padY = slack + 1e-9 * (1 + Math.abs(inner.y));
    for (const cls of sizeClasses) collectCells(cls, inner, padX, padY, found);
    // The loose ones and those from the classes come in different positions: restore the order of `items`.
    if (found.length > 1) found.sort((a, b) => a - b);
    return found.map((pos) => items[pos] as T);
  };
  return { containing };
}

/** Collects into `out` the positions of the class's cells that may contain the point of `inner`. */
function collectCells(
  cls: SizeClass,
  inner: Rect,
  padX: number,
  padY: number,
  out: number[],
): void {
  const x0 = Math.floor((inner.x - padX) / cls.sx) - 1;
  const x1 = Math.floor((inner.x + padX) / cls.sx);
  const y0 = Math.floor((inner.y - padY) / cls.sy) - 1;
  const y1 = Math.floor((inner.y + padY) / cls.sy);
  for (let cx = x0; cx <= x1; cx++) {
    for (let cy = y0; cy <= y1; cy++) {
      const cell = cls.cells.get(cellKey(cx, cy));
      if (cell) for (const pos of cell) out.push(pos);
    }
  }
}
