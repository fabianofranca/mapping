/**
 * Component engine: pure computations of a grid's plan (`layout.type: "grid"`) that do not
 * depend on the engine's closure (`instantiate.ts`). The track and cell computations live in
 * `gridLayout.ts`; here, the measurement ones: the largest cell (`hug`) and the extent of each flow line.
 */
import {
  cellExtent,
  spanExtent,
  trackOffset,
  trackOffsets,
  trackSize,
  trackSizes,
  type GridCell,
  type Track,
} from './gridLayout';

/** The grid's tracks: how many (`columns`/`rows`) or the minimum (`minColumnWidth`/`minRowHeight`). */
export interface GridTracks {
  readonly count?: number | undefined;
  readonly min?: number | undefined;
  /** The track list (v4): `count` is its length. */
  readonly list?: readonly Track[] | undefined;
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

/**
 * The size of each `hug` track of a list: its largest child with `span` 1 (`sizes[i]`, the extent of
 * child `i` on the track axis). A child with `span` > 1 does not size a track; the other tracks are 0.
 */
export function hugTrackSizes(
  tracks: readonly Track[],
  cells: readonly GridCell[],
  sizes: readonly number[],
): number[] {
  const hugs = tracks.map(() => 0);
  cells.forEach((cell, i) => {
    if (cell.span === 1 && tracks[cell.track]?.kind === 'hug')
      hugs[cell.track] = Math.max(hugs[cell.track] ?? 0, sizes[i] ?? 0);
  });
  return hugs;
}

/**
 * What a grid with a track list asks on the track axis (without the padding): px + the `hug` tracks
 * + the gaps and, with `fr` tracks, the largest (cell need ÷ the `n` of its `fr` tracks) × the `fr`
 * total, the CSS minimum by content of `1fr`. A cell's need is its size minus the px, `hug` tracks
 * and gaps it covers.
 */
export function listHugExtent(
  tracks: readonly Track[],
  cells: readonly GridCell[],
  sizes: readonly number[],
  hugs: readonly number[],
  gap: number,
): number {
  const fixed = tracks.map((track, i) =>
    track.kind === 'px' ? track.px : track.kind === 'hug' ? (hugs[i] ?? 0) : 0,
  );
  const shares = tracks.map((track) => (track.kind === 'fr' ? track.fr : 0));
  const total = (list: readonly number[]) => list.reduce((sum, n) => sum + n, 0);
  let perShare = 0;
  cells.forEach((cell, i) => {
    const covered = (list: readonly number[]) =>
      total(list.slice(cell.track, cell.track + cell.span));
    const n = covered(shares);
    if (n <= 0) return;
    const need = (sizes[i] ?? 0) - covered(fixed) - gap * (cell.span - 1);
    perShare = Math.max(perShare, need / n);
  });
  return total(fixed) + gap * Math.max(0, tracks.length - 1) + perShare * total(shares);
}

/**
 * Whether the track geometry needs the children's natural extents: the grid hugs the axis
 * (`content` null) or the list has a `hug` track. Otherwise the tracks do not depend on the children.
 */
export function needsNaturals(
  list: readonly Track[] | undefined,
  content: number | null,
): boolean {
  return content === null || (list?.some((track) => track.kind === 'hug') ?? false);
}

/** Where each track starts and how large its cell is on the track axis, and what the tracks use. */
export interface TrackGeometry {
  readonly offsetOf: (track: number) => number;
  readonly extentOf: (track: number) => number;
  /** The extent of the `span` tracks that start at `track`, with the gaps between them. */
  readonly spanOf: (track: number, span: number) => number;
  /** The tracks and the gaps. */
  readonly used: number;
}

/**
 * The geometry of the grid's tracks on the track axis, for the slot (Arrange, the screen and R0).
 * `naturals[i]` is the extent of child `i` on the axis, in placement order; `content` is the known
 * extent, or `null` when the grid hugs. Without a list the tracks are equal: `(content − gaps) / n`,
 * or the largest child when hugging. With a list (v4), px, `hug` and `fr` as in `trackSizes`.
 */
export function slotTrackGeometry(
  list: readonly Track[] | undefined,
  cells: readonly GridCell[],
  naturals: readonly number[],
  content: number | null,
  spec: { readonly count: number; readonly gap: number },
): TrackGeometry {
  const { count, gap } = spec;
  if (list === undefined) {
    const size =
      content === null
        ? naturals.reduce((widest, n) => Math.max(widest, n), 0)
        : trackSize(content, count, gap);
    return {
      offsetOf: (track) => trackOffset(track, size, gap),
      extentOf: () => size,
      spanOf: (_track, span) => spanExtent(size, span, gap),
      used: count * size + gap * (count - 1),
    };
  }
  const hugs = hugTrackSizes(list, cells, naturals);
  const extent = content ?? listHugExtent(list, cells, naturals, hugs, gap);
  const sizes = trackSizes(list, extent, gap, hugs);
  const offsets = trackOffsets(sizes, gap);
  return {
    offsetOf: (track) => offsets[track] ?? 0,
    extentOf: (track) => sizes[track] ?? 0,
    spanOf: (track, span) => cellExtent(sizes, track, span, gap),
    used: sizes.reduce((sum, size) => sum + size, 0) + gap * (sizes.length - 1),
  };
}
