/**
 * Component engine: pure computations of a grid's plan (`layout.type: "grid"`) that do not
 * depend on the engine's closure (`instantiate.ts`). The track and cell computations live in
 * `gridLayout.ts`; here, the measurement ones: the largest cell (`hug`) and the extent of each flow line.
 */
import type { GridCell } from './gridLayout';

/** The grid's tracks: how many (`columns`/`rows`) or the minimum (`minColumnWidth`/`minRowHeight`). */
export interface GridTracks {
  readonly count?: number | undefined;
  readonly min?: number | undefined;
  /** `true` = the tracks are the columns (width); `false` = the rows (horizontal grid). */
  readonly vertical: boolean;
}

/** The four track keys, with the warning label and what each one is. */
export const TRACK_KEYS = [
  { key: 'columns', field: 'count', vertical: true },
  { key: 'minColumnWidth', field: 'min', vertical: true },
  { key: 'rows', field: 'count', vertical: false },
  { key: 'minRowHeight', field: 'min', vertical: false },
] as const;

/** The track key's expression yielded no value (empty field, `$if` without `else`): the key was not given. */
export function isTrackAbsent(value: unknown): boolean {
  return value === undefined || value === null || String(value).trim() === '';
}

/** The number an expression value represents (a number or numeric text); `NaN` if neither. */
export function numericValue(value: unknown): number {
  if (typeof value === 'number') return value;
  if (typeof value === 'string' && value.trim() !== '') return Number(value);
  return Number.NaN;
}

/** A valid track value: integer ≥ 1 for `columns`/`rows`, number > 0 for the minimum. */
export function validTrack(field: 'count' | 'min', value: unknown): number | undefined {
  const n = numericValue(value);
  if (field === 'count') return Number.isInteger(n) && n >= 1 ? n : undefined;
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

/**
 * The widest track the cells ask for: each child spanning `span` tracks asks for `(size − the
 * span's gaps) / span` per track (equal columns by the largest, the `IntrinsicSize.Min` with `weight(1f)`).
 */
export function maxCellOf(
  cells: readonly GridCell[],
  sizes: readonly number[],
  gap: number,
): number {
  return cells.reduce((widest, cell, i) => {
    const share = ((sizes[i] ?? 0) - gap * (cell.span - 1)) / cell.span;
    return Math.max(widest, share);
  }, 0);
}

/** The extent of each flow line: that of its largest child. */

export function lineExtents(
  cells: readonly GridCell[],
  lines: number,
  sizes: readonly number[],
): number[] {
  const extents = Array.from({ length: lines }, () => 0);
  cells.forEach((cell, i) => {
    extents[cell.line] = Math.max(extents[cell.line] ?? 0, sizes[i] ?? 0);
  });
  return extents;
}
