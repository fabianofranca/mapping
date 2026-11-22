/**
 * Component engine: the grid (`layout.type: "grid"`, v4). Pure functions over numbers: the engine
 * (`instantiate.ts`, the frame and the `repeat`) and the slot arrangement (`arrange.ts`, `layout.ts`,
 * `componentArrange.ts`, `componentMarkings.ts`) use them to decide how many tracks there are, which cell
 * each child falls in and where the cell is.
 *
 * Vocabulary (the vertical grid is the one of `columns`/`minColumnWidth`; the horizontal one, of
 * `rows`/`minRowHeight`, swaps the axes): the **tracks** are the columns of the vertical grid (the
 * rows of the horizontal one), all of the same size; the **flow lines** are the ones formed when
 * filling, from the start track to the end track, one after the other (the columns of the horizontal grid). The
 * **track axis** is the horizontal one in the vertical grid; the **line axis**, the other.
 */
import type { LayoutAlign, LayoutJustify } from './componentFormat';

/** A placed child: the flow line, the track where it starts and how many it occupies. */
export interface GridCell {
  /** Index of the child in the given list (the placement order). */
  readonly index: number;
  /** The flow line (0 is the first). */
  readonly line: number;
  /** The track where it starts (0 is the start one). */
  readonly track: number;
  /** The tracks it occupies (already limited to the number of tracks). */
  readonly span: number;
}

/** A track of a `columns`/`rows` list (v4): px, a share `"<n>fr"` of what is left, or `"hug"` (the largest child). */
export type Track =
  | { readonly kind: 'px'; readonly px: number }
  | { readonly kind: 'fr'; readonly fr: number }
  | { readonly kind: 'hug' };

/** The most tracks a list may have. */
export const MAX_TRACKS = 24;

const FR_PATTERN = /^(\d+(?:\.\d+)?)fr$/;

/** One item of a track list: a number ≥ 0 (px), `"<n>fr"` with n > 0, or `"hug"`; `undefined` for anything else. */
export function parseTrack(item: unknown): Track | undefined {
  if (typeof item === 'number') {
    return Number.isFinite(item) && item >= 0 ? { kind: 'px', px: item } : undefined;
  }
  if (item === 'hug') return { kind: 'hug' };
  const share = typeof item === 'string' ? FR_PATTERN.exec(item) : null;
  const n = share === null ? Number.NaN : Number(share[1]);
  return n > 0 && Number.isFinite(n) ? { kind: 'fr', fr: n } : undefined;
}

/** A non-empty list of up to 24 valid tracks; `undefined` for any other value (an integer included). */
export function parseTrackList(value: unknown): readonly Track[] | undefined {
  if (!Array.isArray(value) || value.length < 1 || value.length > MAX_TRACKS)
    return undefined;
  const tracks = value.map(parseTrack);
  return tracks.every((track) => track !== undefined)
    ? (tracks as readonly Track[])
    : undefined;
}

/**
 * The size of each track of a list in a `content` extent: px is fixed, `hug` is the measured size
 * (`hugs[t]`, the largest span 1 child of the track), and the `fr` tracks split what is left (content
 * − px − hug − gaps) in proportion to `n`, never below 0.
 */
export function trackSizes(
  tracks: readonly Track[],
  content: number,
  gap: number,
  hugs: readonly number[],
): number[] {
  let fixed = gap * Math.max(0, tracks.length - 1);
  let shares = 0;
  tracks.forEach((track, i) => {
    if (track.kind === 'px') fixed += track.px;
    else if (track.kind === 'hug') fixed += hugs[i] ?? 0;
    else shares += track.fr;
  });
  const free = Math.max(0, content - fixed);
  return tracks.map((track, i) => {
    if (track.kind === 'px') return track.px;
    return track.kind === 'hug' ? (hugs[i] ?? 0) : (free * track.fr) / shares;
  });
}

/** Where each track starts, from the start of the content area. */
export function trackOffsets(sizes: readonly number[], gap: number): number[] {
  let at = 0;
  return sizes.map((size) => {
    const start = at;
    at += size + gap;
    return start;
  });
}

/** The extent of the `span` tracks that start at `track`, with the gaps between them. */
export function cellExtent(
  sizes: readonly number[],
  track: number,
  span: number,
  gap: number,
): number {
  const covered = sizes.slice(track, track + span);
  return covered.reduce((sum, size) => sum + size, 0) + gap * Math.max(0, span - 1);
}

/**
 * The `span` of a child: integer ≥ 1, limited to the number of tracks. A missing, non-integer or
 * less-than-1 value counts as 1.
 */
export function clampSpan(value: unknown, count: number): number {
  const n = typeof value === 'number' ? value : parseFloat(String(value));
  if (!Number.isInteger(n) || n < 1) return 1;
  return Math.min(n, Math.max(1, count));
}

/**
 * How many tracks the grid has. `count` (`columns`/`rows`) already comes as an integer ≥ 1. With `min`
 * (`minColumnWidth`/`minRowHeight`), `max(1, floor((content + gap) / (min + gap)))`, the
 * `GridCells.Adaptive`; with no known content (`null`), one track.
 */
export function trackCount(
  spec: { readonly count?: number | undefined; readonly min?: number | undefined },
  content: number | null,
  gap: number,
): number {
  if (spec.count !== undefined) return Math.max(1, Math.floor(spec.count));
  if (spec.min === undefined || content === null || !(spec.min > 0)) return 1;
  return Math.max(1, Math.floor((content + gap) / (spec.min + gap) + 1e-9));
}

/** The size of each track: `(content − gaps) / n` (the `1fr` of each). */
export function trackSize(content: number, count: number, gap: number): number {
  return Math.max(0, (content - gap * Math.max(0, count - 1)) / Math.max(1, count));
}

/** The extent of `span` neighboring tracks of size `size`, with the `gaps` between them. */
export function spanExtent(size: number, span: number, gap: number): number {
  return size * span + gap * Math.max(0, span - 1);
}

/** Where the track `track` starts, from the start of the content area. */
export function trackOffset(track: number, size: number, gap: number): number {
  return track * (size + gap);
}

/**
 * Places the children (each with its `span`) in the cells, in order: each flow line is
 * filled from the start track to the end track; a child that does not fit in what is left of the line goes to the
 * next one and leaves the hole (without `dense`, like `LazyVerticalGrid` and CSS auto-placement).
 */
export function placeCells(
  spans: readonly number[],
  count: number,
): { cells: GridCell[]; lines: number } {
  const n = Math.max(1, Math.floor(count));
  const cells: GridCell[] = [];
  let line = 0;
  let track = 0;
  spans.forEach((raw, index) => {
    const span = clampSpan(raw, n);
    if (track > 0 && track + span > n) {
      line += 1;
      track = 0;
    }
    cells.push({ index, line, track, span });
    track += span;
    if (track >= n) {
      line += 1;
      track = 0;
    }
  });
  const last = cells[cells.length - 1];
  return { cells, lines: last === undefined ? 0 : last.line + 1 };
}

/**
 * Position and size of a child of size `size` inside the cell of extent `cell` (from the
 * start of it): `start` (default), `center` and `end` keep the size; `stretch` makes it fill the
 * cell. A child larger than the cell starts at its start (the excess goes past the end).
 */
export function alignInCell(
  align: LayoutAlign | LayoutJustify,
  cell: number,
  size: number,
): { pos: number; size: number } {
  if (align === 'stretch') return { pos: 0, size: Math.max(0, cell) };
  if (align === 'center') return { pos: (cell - size) / 2, size };
  if (align === 'end') return { pos: cell - size, size };
  return { pos: 0, size };
}
