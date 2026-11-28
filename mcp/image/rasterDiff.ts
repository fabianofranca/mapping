// The pure part of the `render_container` compare: counts the different pixels of two rasters,
// groups them in boxes of changed regions (container pixels) and composes the side-by-side crop.
// No I/O (stage #2928, decisions 9 and 10).

import {
  clampRect,
  createRaster,
  crop,
  flattenOnWhite,
  outlineRect,
  type PixelRect,
  type Raster,
  type Rgb,
} from './raster';

/** Side, in output pixels, of the cells that group the changed pixels. */
export const DIFF_CELL = 16;
/** Most boxes returned; the rest is counted in `omitted`. */
export const MAX_DIFF_BOXES = 20;
/** Margin, in container pixels, around the union of the boxes in the side-by-side crop. */
export const DIFF_MARGIN = 8;
/** Gap, in output pixels, between the two halves of the side-by-side crop. */
export const DIFF_GAP = 8;
/** Color of the boxes outlined on the side-by-side crop (`#FF00FF`). */
export const DIFF_OUTLINE_COLOR: Rgb = [255, 0, 255];

/** How the output pixels of the rasters map to container pixels. */
export interface DiffGeometry {
  /** Output pixels per container pixel. */
  readonly zoom: number;
  /** Container pixel of the rasters' top-left corner (the region's origin). */
  readonly origin: { readonly x: number; readonly y: number };
}

export interface RasterDiff {
  /** Different output pixels (including the area that exists on one side only). */
  readonly pixels: number;
  /** Compared area (larger width and height), in output pixels. */
  readonly area: { readonly width: number; readonly height: number };
  /** The two rasters differ in size. */
  readonly sizeChanged: boolean;
  /** Boxes of the changed regions, in container pixels, largest area first (at most 20). */
  readonly boxes: readonly PixelRect[];
  /** Regions beyond the 20 returned. */
  readonly omitted: number;
}

function differs(a: Raster, b: Raster, x: number, y: number): boolean {
  const inA = x < a.width && y < a.height;
  const inB = x < b.width && y < b.height;
  if (!inA || !inB) return true;
  const i = (y * a.width + x) * 4;
  const j = (y * b.width + x) * 4;
  return (
    a.data[i] !== b.data[j] ||
    a.data[i + 1] !== b.data[j + 1] ||
    a.data[i + 2] !== b.data[j + 2] ||
    a.data[i + 3] !== b.data[j + 3]
  );
}

/** Marks the cells that hold a changed pixel and counts the changed pixels. */
function scanCells(before: Raster, after: Raster, width: number, height: number) {
  const cols = Math.ceil(width / DIFF_CELL);
  const rows = Math.ceil(height / DIFF_CELL);
  const cells = new Uint8Array(cols * rows);
  let pixels = 0;
  for (let y = 0; y < height; y++) {
    const rowStart = Math.floor(y / DIFF_CELL) * cols;
    for (let x = 0; x < width; x++) {
      if (!differs(before, after, x, y)) continue;
      pixels++;
      cells[rowStart + Math.floor(x / DIFF_CELL)] = 1;
    }
  }
  return { cells, cols, rows, pixels };
}

/** Pushes the unseen marked neighbors (8-connected) of cell `at` onto `stack`. */
function pushNeighbors(
  cells: Uint8Array,
  seen: Uint8Array,
  stack: number[],
  at: number,
  cols: number,
  rows: number,
): void {
  const cx = at % cols;
  const cy = (at - cx) / cols;
  for (let ny = Math.max(0, cy - 1); ny <= Math.min(rows - 1, cy + 1); ny++) {
    for (let nx = Math.max(0, cx - 1); nx <= Math.min(cols - 1, cx + 1); nx++) {
      const next = ny * cols + nx;
      if (!cells[next] || seen[next]) continue;
      seen[next] = 1;
      stack.push(next);
    }
  }
}

/** Bounding boxes, in cells, of the 8-connected groups of marked cells. */
function groupCells(cells: Uint8Array, cols: number, rows: number): PixelRect[] {
  const seen = new Uint8Array(cells.length);
  const groups: PixelRect[] = [];
  for (let start = 0; start < cells.length; start++) {
    if (!cells[start] || seen[start]) continue;
    seen[start] = 1;
    const stack = [start];
    let x0 = cols;
    let y0 = rows;
    let x1 = -1;
    let y1 = -1;
    while (stack.length > 0) {
      const at = stack.pop()!;
      const cx = at % cols;
      const cy = (at - cx) / cols;
      x0 = Math.min(x0, cx);
      x1 = Math.max(x1, cx);
      y0 = Math.min(y0, cy);
      y1 = Math.max(y1, cy);
      pushNeighbors(cells, seen, stack, at, cols, rows);
    }
    groups.push({ x: x0, y: y0, width: x1 - x0 + 1, height: y1 - y0 + 1 });
  }
  return groups;
}

/** A box of cells to container pixels: clamped to the area, converted and rounded outward. */
function toContainerBox(
  cellBox: PixelRect,
  area: { width: number; height: number },
  geometry: DiffGeometry,
): PixelRect {
  const left = cellBox.x * DIFF_CELL;
  const top = cellBox.y * DIFF_CELL;
  const right = Math.min(area.width, (cellBox.x + cellBox.width) * DIFF_CELL);
  const bottom = Math.min(area.height, (cellBox.y + cellBox.height) * DIFF_CELL);
  const x0 = Math.floor(geometry.origin.x + left / geometry.zoom);
  const y0 = Math.floor(geometry.origin.y + top / geometry.zoom);
  const x1 = Math.ceil(geometry.origin.x + right / geometry.zoom);
  const y1 = Math.ceil(geometry.origin.y + bottom / geometry.zoom);
  return { x: x0, y: y0, width: x1 - x0, height: y1 - y0 };
}

function byAreaDescending(a: PixelRect, b: PixelRect): number {
  return b.width * b.height - a.width * a.height || a.y - b.y || a.x - b.x;
}

/**
 * Compares two rasters over the larger width and height, top-left aligned: a pixel is
 * different when any RGBA channel differs or when it exists on one side only. Linear in
 * the compared area.
 */
export function diffRasters(
  before: Raster,
  after: Raster,
  geometry: DiffGeometry,
): RasterDiff {
  const area = {
    width: Math.max(before.width, after.width),
    height: Math.max(before.height, after.height),
  };
  const { cells, cols, rows, pixels } = scanCells(before, after, area.width, area.height);
  const boxes = groupCells(cells, cols, rows)
    .map((box) => toContainerBox(box, area, geometry))
    .sort(byAreaDescending);
  return {
    pixels,
    area,
    sizeChanged: before.width !== after.width || before.height !== after.height,
    boxes: boxes.slice(0, MAX_DIFF_BOXES),
    omitted: Math.max(0, boxes.length - MAX_DIFF_BOXES),
  };
}

/** Union of the boxes with the margin, clamped to the compared area (container pixels). */
export function unionRegion(
  boxes: readonly PixelRect[],
  area: { width: number; height: number },
  geometry: DiffGeometry,
): PixelRect | null {
  if (boxes.length === 0) return null;
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const box of boxes) {
    x0 = Math.min(x0, box.x);
    y0 = Math.min(y0, box.y);
    x1 = Math.max(x1, box.x + box.width);
    y1 = Math.max(y1, box.y + box.height);
  }
  const limitX = geometry.origin.x + Math.ceil(area.width / geometry.zoom);
  const limitY = geometry.origin.y + Math.ceil(area.height / geometry.zoom);
  const left = Math.max(geometry.origin.x, x0 - DIFF_MARGIN);
  const top = Math.max(geometry.origin.y, y0 - DIFF_MARGIN);
  const right = Math.min(limitX, x1 + DIFF_MARGIN);
  const bottom = Math.min(limitY, y1 + DIFF_MARGIN);
  return { x: left, y: top, width: right - left, height: bottom - top };
}

/** The crop of `raster` over `window` (output pixels); what falls outside it stays transparent. */
function cropPadded(raster: Raster, window: PixelRect): Raster {
  const out = createRaster(window.width, window.height);
  const inside = clampRect(window, raster);
  if (!inside) return out;
  const piece = crop(raster, inside);
  for (let row = 0; row < piece.height; row++) {
    const from = row * piece.width * 4;
    const to = ((inside.y - window.y + row) * window.width + (inside.x - window.x)) * 4;
    out.data.set(piece.data.subarray(from, from + piece.width * 4), to);
  }
  return out;
}

function paste(target: Raster, piece: Raster, offsetX: number): void {
  for (let row = 0; row < piece.height; row++) {
    const from = row * piece.width * 4;
    target.data.set(
      piece.data.subarray(from, from + piece.width * 4),
      (row * target.width + offsetX) * 4,
    );
  }
}

export interface SideBySide {
  readonly raster: Raster;
  /** The union crop, in container pixels. */
  readonly region: PixelRect;
}

/**
 * The side-by-side crop of the boxes: the union with an 8 container pixel margin, the before
 * crop on the left, a gap of 8 output pixels and the after crop on the right, each box
 * outlined in `#FF00FF` on both halves. With `opaque` the gap (and any transparency) is
 * white, for JPEG. `null` without boxes.
 */
export function sideBySide(
  before: Raster,
  after: Raster,
  diff: Pick<RasterDiff, 'boxes' | 'area'>,
  geometry: DiffGeometry,
  opaque = false,
): SideBySide | null {
  const region = unionRegion(diff.boxes, diff.area, geometry);
  if (!region) return null;
  const window: PixelRect = {
    x: Math.floor((region.x - geometry.origin.x) * geometry.zoom),
    y: Math.floor((region.y - geometry.origin.y) * geometry.zoom),
    width: Math.ceil(region.width * geometry.zoom),
    height: Math.ceil(region.height * geometry.zoom),
  };
  const raster = createRaster(window.width * 2 + DIFF_GAP, window.height);
  paste(raster, cropPadded(before, window), 0);
  const afterOffset = window.width + DIFF_GAP;
  paste(raster, cropPadded(after, window), afterOffset);
  for (const box of diff.boxes) {
    const rect: PixelRect = {
      x: Math.round((box.x - geometry.origin.x) * geometry.zoom) - window.x,
      y: Math.round((box.y - geometry.origin.y) * geometry.zoom) - window.y,
      width: Math.round(box.width * geometry.zoom),
      height: Math.round(box.height * geometry.zoom),
    };
    outlineRect(raster, rect, DIFF_OUTLINE_COLOR);
    outlineRect(raster, { ...rect, x: rect.x + afterOffset }, DIFF_OUTLINE_COLOR);
  }
  return { raster: opaque ? flattenOnWhite(raster) : raster, region };
}
