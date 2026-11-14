import { arrowIdsAttachedTo, withoutArrows } from './arrows';
import { fail } from './errors';
import { HEX_COLOR_RE } from './hexColor';
import { idInUse } from './projectIndex';
import {
  MIN_MARKING_SIZE,
  bottom,
  clamp,
  EPSILON,
  containsRect,
  effectiveMinSize,
  imageCanvasRect,
  imagePixelRect,
  rectsOverlap,
  right,
  snapPlacement,
  type Size,
} from './geometry';
import { settleFrom, type SettleOptions } from './hierarchySettle';
import {
  canDeleteImage,
  canEditImagePlacement,
  canReplaceImage,
  requireUnlocked,
} from './locks';
import { findById, normalizeOptionalName, updateById } from './project';
import { countBrokenRefs } from './refs';
import type { Marking, Placement, Project, ProjectContainer, Rect } from './types';

/** Longest side of a newly added image, in canvas units. */
export const INITIAL_IMAGE_SIZE = 1000;
/** Space between the new image and the rightmost image, in canvas units. */
export const IMAGE_GAP = 50;
/** Gap between a new piece and the obstacles, in the space's units (image or canvas pixels). */
export const PLACEMENT_GAP = 8;
/** Largest aspect-ratio difference considered "the same" when replacing an image. */
export const ASPECT_TOLERANCE = 0.01;

/** Largest side (width or height) of a container without a file, in pixels. */
export const MAX_CONTAINER_SIZE = 20000;

export interface ImageFile {
  readonly file: string;
  readonly width: number;
  readonly height: number;
}

function checkDimensions({
  width,
  height,
}: {
  readonly width: number;
  readonly height: number;
}): void {
  const ok = (n: number) => Number.isInteger(n) && n > 0;
  if (!ok(width) || !ok(height)) fail('invalid-dimensions');
}

/** Valid background color (`#RRGGBB`), in uppercase. */
function checkBackground(color: string): string {
  if (!HEX_COLOR_RE.test(color)) fail('invalid-color');
  return color.toUpperCase();
}

/** Dimensions of a container without a file: integers from 1 to `MAX_CONTAINER_SIZE`. */
function checkBackgroundDimensions(size: {
  readonly width: number;
  readonly height: number;
}): void {
  checkDimensions(size);
  if (size.width > MAX_CONTAINER_SIZE || size.height > MAX_CONTAINER_SIZE) {
    fail('invalid-dimensions');
  }
}

/** `true` if the image is a container without a file (no file, only a background color). */
export function isBackgroundContainer(image: Pick<ProjectContainer, 'file'>): boolean {
  return image.file === null;
}

function checkPlacement({ x, y, scale }: Placement): void {
  if (![x, y, scale].every(Number.isFinite) || scale <= 0) fail('invalid-placement');
}

/** Free position to the right of all images (except `excludeId`). */
function placementAtRight(p: Project, scale: number, excludeId?: string): Placement {
  const others = p.containers.filter((i) => i.id !== excludeId);
  const rects = others.map((i) => imageCanvasRect(i, i.placement));
  if (rects.length === 0) return snapPlacement({ x: 0, y: 0, scale });
  const rightmost = rects.reduce((a, b) => (right(b) > right(a) ? b : a));
  return snapPlacement({ x: right(rightmost) + IMAGE_GAP, y: rightmost.y, scale });
}

/** Open interval of `y` (from the top edge) that overlaps an obstacle. */
type YSpan = readonly [number, number];

/** Intervals of `y` blocked by the obstacles crossing the column from `x` to `x + width`, sorted and merged. */
function forbiddenYs(
  obstacles: readonly Rect[],
  x: number,
  width: number,
  height: number,
): YSpan[] {
  const spans: [number, number][] = [];
  for (const o of obstacles) {
    if (!rectsOverlap({ x, y: o.y, width, height: o.height }, o)) continue;
    spans.push([o.y - height + EPSILON, bottom(o) - EPSILON]);
  }
  spans.sort((a, b) => a[0] - b[0]);
  const merged: [number, number][] = [];
  for (const span of spans) {
    const last = merged[merged.length - 1];
    if (last && span[0] < last[1]) last[1] = Math.max(last[1], span[1]);
    else merged.push([span[0], span[1]]);
  }
  return merged;
}

/** `y` falls inside some open interval (binary search over the merged intervals). */
function isBlocked(spans: readonly YSpan[], y: number): boolean {
  let lo = 0;
  let hi = spans.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const [from, to] = spans[mid] as YSpan;
    if (y <= from) hi = mid - 1;
    else if (y >= to) lo = mid + 1;
    else return true;
  }
  return false;
}

/**
 * The nearest free spot to `wanted` (top-left corner) for a rectangle of
 * `width` × `height` that does not overlap any of the `obstacles`. Tests the requested point and
 * the fits against the obstacles' edges (with the `gap`); the smallest distance wins and the
 * first one breaks ties. There is always one (to the right of all the obstacles). Valid for any
 * canvas space: serves `placementNear` and the arrival of perspectives.
 */
export function nearestFreeSpot(
  obstacles: readonly Rect[],
  width: number,
  height: number,
  wanted: { readonly x: number; readonly y: number },
  gap: number = IMAGE_GAP,
): { x: number; y: number } {
  const xs = [wanted.x];
  const ys = [wanted.y];
  for (const o of obstacles) {
    xs.push(right(o) + gap, o.x - gap - width);
    ys.push(o.y + o.height + gap, o.y - gap - height);
  }
  let best: { x: number; y: number } | null = null;
  let bestDistance = Infinity;
  for (const x of xs) {
    // Only the obstacles crossing the column [x, x + width) block any y; each one blocks the
    // open interval of y where the rectangle would overlap it.
    const blocked = forbiddenYs(obstacles, x, width, height);
    for (const y of ys) {
      if (isBlocked(blocked, y)) continue;
      const distance = Math.hypot(x - wanted.x, y - wanted.y);
      if (distance < bestDistance) {
        best = { x, y };
        bestDistance = distance;
      }
    }
  }
  if (best) return best;
  if (obstacles.length === 0) return { x: wanted.x, y: wanted.y };
  const rightmost = obstacles.reduce((a, b) => (right(b) > right(a) ? b : a));
  return { x: right(rightmost) + gap, y: rightmost.y };
}

/**
 * Is the rectangle free? It fits in `area` (when there is one) and overlaps none of the `obstacles`
 * (`rectsOverlap`, positive area: touching is not overlapping).
 */
export function isFreeRect(
  rect: Rect,
  obstacles: readonly Rect[],
  area: Rect | null,
): boolean {
  if (area !== null && !containsRect(area, rect)) return false;
  return !obstacles.some((o) => rectsOverlap(rect, o));
}

/** Candidate coordinates of one axis, integers and always away from the obstacle (ceiling ahead, floor behind). */
function spotAxis(
  wanted: number,
  size: number,
  gap: number,
  edges: readonly (readonly [number, number])[],
  bounds: readonly [number, number] | null,
): number[] {
  const values = [wanted];
  if (bounds !== null) values.push(Math.ceil(bounds[0]), Math.floor(bounds[1] - size));
  for (const [low, high] of edges) {
    values.push(Math.ceil(high + gap), Math.floor(low - gap - size));
  }
  // No duplicates (grids and repeated pieces give the same edge several times); the order of
  // first appearance stays, and it breaks distance ties.
  const unique = [...new Set(values)];
  return bounds === null
    ? unique
    : unique.filter((v) => v >= bounds[0] && v + size <= bounds[1]);
}

/**
 * The nearest free spot to `wanted` (top-left corner) for a rectangle of
 * `width` × `height` that does not overlap any of the `obstacles`, **inside `area`** (when
 * there is one). The candidates are `wanted` itself, the fits against the obstacles' edges
 * (with the `gap`) and the edges of `area` (no gap: the piece may touch them); only what fits in the
 * area and is free counts. The smallest distance wins and the first one breaks ties. With `area`,
 * returns `null` when there is no valid candidate; without `area` there is always one (to the
 * right of all). Integer coordinates.
 */
export function nearestFreeSpotIn(
  obstacles: readonly Rect[],
  width: number,
  height: number,
  wanted: { readonly x: number; readonly y: number },
  area: Rect | null,
  gap: number = PLACEMENT_GAP,
): { x: number; y: number } | null {
  const xs = spotAxis(
    wanted.x,
    width,
    gap,
    obstacles.map((o) => [o.x, right(o)] as const),
    area === null ? null : [area.x, right(area)],
  );
  const ys = spotAxis(
    wanted.y,
    height,
    gap,
    obstacles.map((o) => [o.y, bottom(o)] as const),
    area === null ? null : [area.y, bottom(area)],
  );
  let best: { x: number; y: number } | null = null;
  let bestDistance = Infinity;
  for (const x of xs) {
    const blocked = forbiddenYs(obstacles, x, width, height);
    for (const y of ys) {
      if (isBlocked(blocked, y)) continue;
      const distance = Math.hypot(x - wanted.x, y - wanted.y);
      if (distance < bestDistance) {
        best = { x, y };
        bestDistance = distance;
      }
    }
  }
  return best;
}

/**
 * Free position nearest to `center` (canvas point where the image's
 * center should be). Tests the requested point and the fits against the edges
 * of the other images; one always exists (to the right of all).
 */
export function placementNear(
  p: Project,
  size: { readonly width: number; readonly height: number },
  scale: number,
  center: { readonly x: number; readonly y: number },
  excludeId?: string,
): Placement {
  const w = size.width * scale;
  const h = size.height * scale;
  const wanted = { x: center.x - w / 2, y: center.y - h / 2 };
  const others = p.containers
    .filter((i) => i.id !== excludeId)
    .map((i) => imageCanvasRect(i, i.placement));
  return snapPlacement({ ...nearestFreeSpot(others, w, h, wanted), scale });
}

/**
 * The first container that the image, at `placement`, would start to overlap; `null` if
 * none. It is the "other" of `image-overlap`.
 */
export function overlappingContainer(
  p: Project,
  containerId: string,
  placement: Placement,
): ProjectContainer | null {
  const image = findById(p.containers, containerId);
  const rect = imageCanvasRect(image, placement);
  return (
    p.containers.find(
      (other) =>
        other.id !== containerId &&
        rectsOverlap(rect, imageCanvasRect(other, other.placement)),
    ) ?? null
  );
}

function failOverlap(other: ProjectContainer): never {
  fail('image-overlap', undefined, { containerId: other.id });
}

/** Files of the images (a container without a file has none), in the images' order. */
export function imageFileNames(
  images: readonly Pick<ProjectContainer, 'file'>[],
): string[] {
  const files: string[] = [];
  for (const image of images) if (image.file !== null) files.push(image.file);
  return files;
}

/** Project file at the root of the folder/zip (app and MCP server). */
export const MAPPING_FILE = 'mapping.json';
/** Folder of the images, relative to the project root (app and MCP server). */
export const IMAGES_DIR = 'images';

/**
 * Comparison key for file names: NFC and lowercase. On NTFS/APFS `Foto.jpg` and
 * `foto.jpg` are the same file, and the decomposed name (`é` = `e` + accent) becomes the composed one
 * when written; the uniqueness of the names the app and the MCP create is decided by this key. The
 * stored name keeps the case it came with.
 */
export function fileNameKey(path: string): string {
  return path.normalize('NFC').toLowerCase();
}

const sameFile = (a: string, b: string): boolean => fileNameKey(a) === fileNameKey(b);

/**
 * Free name in `images/`: `foto.jpg`, `foto-2.jpg`, `foto-3.jpg`… without distinguishing upper
 * and lower case (`fileNameKey`). `taken` lists paths occupied outside the project (files already
 * existing in the folder).
 */
export function uniqueImageFile(
  p: Project,
  fileName: string,
  taken: ReadonlySet<string> = new Set(),
): string {
  const used = new Set<string>();
  for (const path of taken) used.add(fileNameKey(path));
  for (const i of p.containers) if (i.file !== null) used.add(fileNameKey(i.file));
  const dot = fileName.lastIndexOf('.');
  const base = dot > 0 ? fileName.slice(0, dot) : fileName;
  const ext = dot > 0 ? fileName.slice(dot) : '';
  let candidate = `${IMAGES_DIR}/${fileName}`;
  for (let n = 2; used.has(fileNameKey(candidate)); n++) {
    candidate = `${IMAGES_DIR}/${base}-${n}${ext}`;
  }
  return candidate;
}

/**
 * Place and scale of a new container beside `besideId`: to its right (right edge plus
 * `IMAGE_GAP`), with the top aligned and the same `scale`; if occupied, it goes to the nearest free
 * space, keeping the scale. A nonexistent `besideId` fails with `not-found`.
 */
function placementBeside(
  p: Project,
  size: { readonly width: number; readonly height: number },
  besideId: string,
): Placement {
  const reference = p.containers.find((c) => c.id === besideId);
  if (!reference) fail('not-found', besideId);
  const { scale } = reference.placement;
  const referenceRect = imageCanvasRect(reference, reference.placement);
  const wanted = { x: right(referenceRect) + IMAGE_GAP, y: referenceRect.y };
  const obstacles = p.containers.map((c) => imageCanvasRect(c, c.placement));
  return snapPlacement({
    ...nearestFreeSpot(obstacles, size.width * scale, size.height * scale, wanted),
    scale,
  });
}

/** Scale and place of a new container: beside `beside`, near `center` or to the right of all. */
function newContainerPlacement(
  p: Project,
  size: { readonly width: number; readonly height: number },
  args: {
    readonly center?: { readonly x: number; readonly y: number };
    readonly beside?: string;
  },
): Placement {
  if (args.beside !== undefined) return placementBeside(p, size, args.beside);
  const scale = INITIAL_IMAGE_SIZE / Math.max(size.width, size.height);
  return args.center
    ? placementNear(p, size, scale, args.center)
    : placementAtRight(p, scale);
}

/**
 * Adds the image, with the longest side measuring `INITIAL_IMAGE_SIZE` units of the
 * canvas: near `center`, if given; otherwise to the right of the rightmost image. It is born
 * without a parent (`parentId: null`); the settle decides whether some canvas marking contains it.
 */
export function addContainer(
  p: Project,
  args: ImageFile & {
    readonly id: string;
    /** Where the image's center should be (goes to the nearest free space). */
    readonly center?: { readonly x: number; readonly y: number };
    /** Id of a container: the new one is born to its right, with the same scale. */
    readonly beside?: string;
  },
  options?: SettleOptions,
): Project {
  if (idInUse(p, args.id)) fail('duplicate-id', args.id);
  checkDimensions(args);
  if (p.containers.some((i) => i.file !== null && sameFile(i.file, args.file))) {
    fail('duplicate-file');
  }
  const image: ProjectContainer = {
    id: args.id,
    name: null,
    parentId: null,
    markingColor: null,
    locked: false,
    source: null,
    file: args.file,
    background: null,
    width: args.width,
    height: args.height,
    placement: newContainerPlacement(p, args, args),
  };
  return settleFrom(p, { ...p, containers: [...p.containers, image] }, options);
}

/**
 * Adds a container without a file (image without a file, only a background color), with the same
 * placement as `addContainer`: longest side of `INITIAL_IMAGE_SIZE` canvas units.
 */
export function addBackgroundContainer(
  p: Project,
  args: {
    readonly id: string;
    readonly name?: string | null;
    readonly width: number;
    readonly height: number;
    /** Background color (`#RRGGBB`). */
    readonly background: string;
    /** Where the image's center should be (goes to the nearest free space). */
    readonly center?: { readonly x: number; readonly y: number };
    /** Id of a container: the new one is born to its right, with the same scale. */
    readonly beside?: string;
  },
  options?: SettleOptions,
): Project {
  if (idInUse(p, args.id)) fail('duplicate-id', args.id);
  checkBackgroundDimensions(args);
  const background = checkBackground(args.background);
  const name = normalizeOptionalName(args.name ?? null);
  const image: ProjectContainer = {
    id: args.id,
    name,
    parentId: null,
    markingColor: null,
    locked: false,
    source: null,
    file: null,
    background,
    width: args.width,
    height: args.height,
    placement: newContainerPlacement(p, args, args),
  };
  return settleFrom(p, { ...p, containers: [...p.containers, image] }, options);
}

export interface BackgroundContainerChanges {
  readonly width?: number;
  readonly height?: number;
  readonly background?: string;
}

/**
 * Edits the container without a file: size and/or background color. Changing the size is geometry
 * (a locked image refuses with `locked`), keeps the `placement` scale and refuses if some
 * marking stops fitting (`rect-out-of-image`) or if the image starts overlapping another
 * (`image-overlap`). Only valid for a container without a file (`container-has-file`).
 */
export function setBackgroundContainer(
  p: Project,
  containerId: string,
  changes: BackgroundContainerChanges,
  options?: SettleOptions,
): Project {
  const image = findById(p.containers, containerId);
  if (!isBackgroundContainer(image)) fail('container-has-file');
  const background =
    changes.background === undefined
      ? image.background
      : checkBackground(changes.background);
  const width = changes.width ?? image.width;
  const height = changes.height ?? image.height;
  const resized = width !== image.width || height !== image.height;
  if (resized) {
    checkBackgroundDimensions({ width, height });
    requireUnlocked(canEditImagePlacement(p, containerId));
    const bounds = imagePixelRect({ width, height });
    for (const m of p.markings) {
      if (m.containerId === containerId && !containsRect(bounds, m.rect)) {
        fail('rect-out-of-image', m.id);
      }
    }
    const overlap = overlappingContainer(
      {
        ...p,
        containers: updateById(p.containers, containerId, (i) => ({
          ...i,
          width,
          height,
        })),
      },
      containerId,
      image.placement,
    );
    if (overlap) failOverlap(overlap);
  }
  if (!resized && background === image.background) return p;
  return settleFrom(
    p,
    {
      ...p,
      containers: updateById(p.containers, containerId, (i) => ({
        ...i,
        width,
        height,
        background,
      })),
    },
    options,
  );
}

/** Display name of the image; empty becomes `null` (the app shows the file name). */
export function renameContainer(
  p: Project,
  containerId: string,
  name: string | null,
): Project {
  const normalized = normalizeOptionalName(name);
  return {
    ...p,
    containers: updateById(p.containers, containerId, (i) => ({
      ...i,
      name: normalized,
    })),
  };
}

/** Color suggestions for the markings' border (high contrast over light and dark photos). */
export const MARKING_COLOR_PALETTE: readonly string[] = [
  '#FFFFFF',
  '#000000',
  '#FFEB3B',
  '#00E5FF',
  '#76FF03',
  '#FF4081',
  '#FF6D00',
  '#E53935',
];

/** Border color of the image's markings (`#RRGGBB`); `null` goes back to the theme color. */
export function setContainerMarkingColor(
  p: Project,
  containerId: string,
  color: string | null,
): Project {
  if (color !== null && !HEX_COLOR_RE.test(color)) fail('invalid-color');
  const normalized = color === null ? null : color.toUpperCase();
  return {
    ...p,
    containers: updateById(p.containers, containerId, (i) => ({
      ...i,
      markingColor: normalized,
    })),
  };
}

/**
 * Sets position and scale (move or resize). Fails if it overlaps another image or if the
 * container (or the canvas marking that contains it) is locked. Settles at the end (unless
 * `settle: false`, from gesture previews): the container enters or leaves a canvas marking,
 * and the canvas markings that now fit entirely inside it become its own.
 */
export function setContainerPlacement(
  p: Project,
  containerId: string,
  placement: Placement,
  options?: SettleOptions,
): Project {
  checkPlacement(placement);
  requireUnlocked(canEditImagePlacement(p, containerId));
  // Only write door of the `placement` by movement: floating-point noise vanishes here.
  const copy = snapPlacement(placement);
  const overlap = overlappingContainer(p, containerId, copy);
  if (overlap) failOverlap(overlap);
  // Placement equal to the current one: nothing changed (a drag with no effect); returns the same project so
  // the gesture does not record an empty undo entry.
  // Compares with the already-cleaned current one: an old file with a tail does not become a write on a no-effect drag.
  const current = snapPlacement(findById(p.containers, containerId).placement);
  if (current.x === copy.x && current.y === copy.y && current.scale === copy.scale) {
    return p;
  }
  return settleFrom(
    p,
    {
      ...p,
      containers: updateById(p.containers, containerId, (i) => ({
        ...i,
        placement: copy,
      })),
    },
    options,
  );
}

export function moveContainer(
  p: Project,
  containerId: string,
  x: number,
  y: number,
  options?: SettleOptions,
): Project {
  const { placement } = findById(p.containers, containerId);
  return setContainerPlacement(p, containerId, { ...placement, x, y }, options);
}

/** Proportional resize: new scale with the given corner (`x`, `y`). */
export function resizeContainer(
  p: Project,
  containerId: string,
  placement: Placement,
  options?: SettleOptions,
): Project {
  return setContainerPlacement(p, containerId, placement, options);
}

export function containerDeletionImpact(
  p: Project,
  containerId: string,
): {
  markings: number;
  /** How many of the markings are locked (they will be deleted along with it). */
  lockedMarkings: number;
  /** Annotations that go away: those of the container's markings and those of the arrows attached to them. */
  annotations: number;
  /** Arrows attached to some marking of the container (as source or target): they go along. */
  arrows: number;
  brokenRefs: number;
} {
  findById(p.containers, containerId);
  const own = p.markings.filter((m) => m.containerId === containerId);
  const ids = new Set(own.map((m) => m.id));
  const arrowIds = arrowIdsAttachedTo(p, ids);
  return {
    markings: ids.size,
    lockedMarkings: own.filter((m) => m.locked).length,
    annotations: p.annotations.filter(
      (a) => ids.has(a.markingId) || arrowIds.has(a.markingId),
    ).length,
    arrows: arrowIds.size,
    brokenRefs: countBrokenRefs(p, cascadeRemoveImage(p, containerId)),
  };
}

/**
 * Deletes the image with its markings (locked or not), the arrows attached to them and the annotations of
 * all of that. Fails only if the image itself is locked. The canvas markings stay and the
 * settle redoes membership.
 */
export function removeContainer(
  p: Project,
  containerId: string,
  options?: SettleOptions,
): Project {
  findById(p.containers, containerId);
  requireUnlocked(canDeleteImage(p, containerId));
  return settleFrom(p, cascadeRemoveImage(p, containerId), options);
}

/** The deletion itself, without the lock: also serves to count the impact. */
function cascadeRemoveImage(p: Project, containerId: string): Project {
  const ids = new Set(
    p.markings.filter((m) => m.containerId === containerId).map((m) => m.id),
  );
  return withoutArrows(
    {
      ...p,
      containers: p.containers.filter((i) => i.id !== containerId),
      markings: p.markings.filter((m) => !ids.has(m.id)),
      annotations: p.annotations.filter((a) => !ids.has(a.markingId)),
    },
    arrowIdsAttachedTo(p, ids),
  );
}

/** `true` if the replacement keeps the aspect ratio (difference ≤ 1%). */
export function isSameAspect(
  old: Pick<ProjectContainer, 'width' | 'height'>,
  next: Pick<ImageFile, 'width' | 'height'>,
): boolean {
  const sx = next.width / old.width;
  const sy = next.height / old.height;
  return Math.abs(sx / sy - 1) <= ASPECT_TOLERANCE;
}

/**
 * Rescales an interval [start, end) rounding the edges. Since the rounding
 * is monotonic, containment between parent and child and the image bounds are preserved.
 */
function scaleSpan(start: number, size: number, factor: number): [number, number] {
  const a = Math.round(start * factor);
  const b = Math.round((start + size) * factor);
  return [a, b - a];
}

/** The rectangle rescaled from `from` to `to`, without the minimum (the proposal compares with it). */
export function scaleRect(r: Rect, from: Size, to: Size): Rect {
  const [x, width] = scaleSpan(r.x, r.width, to.width / from.width);
  const [y, height] = scaleSpan(r.y, r.height, to.height / from.height);
  return { x, y, width, height };
}

/**
 * Ensures the minimum size by growing the small side around the center, without leaving
 * [min, max). The result always contains the original interval; if the minimum does not fit,
 * the side takes up the whole interval.
 */
function growSpan(
  start: number,
  size: number,
  min: number,
  max: number,
  least: number,
): [number, number] {
  if (size >= least) return [start, size];
  if (least >= max - min) return [min, max - min];
  const grown = clamp(start - Math.floor((least - size) / 2), min, max - least);
  return [grown, least];
}

/**
 * Rescales each marking of the image on its own (rounded edges, attached to the new image), without
 * depending on the parent: the parent is derived from geometry, and the settle redoes membership afterwards.
 * At the same scale the rectangle stays as it is. The side only grows if the rescale left it below the
 * marking's effective minimum (`minSizeOf`: the component's `minSize`, or 8 px on a marking
 * plain one); whatever grew because of this stopped being proportional and gets `needsReview`.
 */
function rescaleMarkings(
  markings: readonly Marking[],
  image: ProjectContainer,
  next: ImageFile,
  needsReview: boolean,
  minSizeOf?: (markingId: string) => Size | null,
): Map<string, Marking> {
  const sx = next.width / image.width;
  const sy = next.height / image.height;
  const bounds = imagePixelRect(next);
  const result = new Map<string, Marking>();
  for (const m of markings) {
    if (sx === 1 && sy === 1) {
      result.set(m.id, { ...m, needsReview: needsReview || m.needsReview });
      continue;
    }
    const least = effectiveMinSize(minSizeOf?.(m.id) ?? null);
    const [x0, w0] = scaleSpan(m.rect.x, m.rect.width, sx);
    const [y0, h0] = scaleSpan(m.rect.y, m.rect.height, sy);
    const [x, width] = growSpan(x0, w0, bounds.x, right(bounds), least.width);
    const [y, height] = growSpan(y0, h0, bounds.y, bottom(bounds), least.height);
    const grew = width !== w0 || height !== h0;
    result.set(m.id, {
      ...m,
      rect: { x, y, width, height },
      needsReview: needsReview || grew || m.needsReview,
    });
  }
  return result;
}

export interface ReplaceContainerOptions extends SettleOptions {
  /** The user confirmed the replacement by an image with a different aspect ratio. */
  readonly confirmAspectChange?: boolean;
}

/**
 * Replaces the image's file keeping the markings (rescaled). With a different
 * aspect ratio, requires confirmation and marks all markings with `needsReview`.
 * Keeps `x`/`y` and the displayed width; if it starts overlapping another image,
 * it goes to a free space to the right.
 */
export function replaceContainer(
  p: Project,
  containerId: string,
  next: ImageFile,
  options: ReplaceContainerOptions = {},
): Project {
  checkDimensions(next);
  const image = findById(p.containers, containerId);
  if (isBackgroundContainer(image)) fail('container-without-file');
  requireUnlocked(canReplaceImage(p, containerId, next));
  if (
    p.containers.some(
      (i) => i.id !== containerId && i.file !== null && sameFile(i.file, next.file),
    )
  )
    fail('duplicate-file');
  const sameAspect = isSameAspect(image, next);
  if (!sameAspect && !options.confirmAspectChange) fail('aspect-change-not-confirmed');

  const own = p.markings.filter((m) => m.containerId === containerId);
  if (
    own.length > 0 &&
    (next.width < MIN_MARKING_SIZE || next.height < MIN_MARKING_SIZE)
  ) {
    fail('image-too-small');
  }
  const rescaled = rescaleMarkings(own, image, next, !sameAspect, options.minSizeOf);

  const scale = (image.placement.scale * image.width) / next.width;
  let placement: Placement = snapPlacement({ ...image.placement, scale });
  const candidate = imageCanvasRect(next, placement);
  const overlaps = p.containers.some(
    (o) =>
      o.id !== containerId && rectsOverlap(candidate, imageCanvasRect(o, o.placement)),
  );
  if (overlaps) {
    placement = placementAtRight(p, scale, containerId);
  }

  // The replacement may move the image on the canvas (scale and place): a lock above also prevents it.
  requireUnlocked(canReplaceImage(p, containerId, { ...next, placement }));

  const ownIds = new Set(own.map((m) => m.id));
  const sx = next.width / image.width;
  const sy = next.height / image.height;
  // Arrow with both ends in this container: the waypoints are in its pixels and
  // follow the new image (the route survives the replacement; with the same resolution nothing changes).
  const arrows =
    sx === 1 && sy === 1
      ? p.arrows
      : p.arrows.map((a) =>
          a.points.length > 0 && ownIds.has(a.from) && ownIds.has(a.to)
            ? {
                ...a,
                points: a.points.map((pt) => ({ x: pt.x * sx, y: pt.y * sy })),
              }
            : a,
        );

  const updated: ProjectContainer = {
    ...image,
    file: next.file,
    background: null,
    width: next.width,
    height: next.height,
    placement,
  };
  return settleFrom(
    p,
    {
      ...p,
      containers: p.containers.map((i) => (i.id === containerId ? updated : i)),
      markings: p.markings.map((m) => rescaled.get(m.id) ?? m),
      arrows,
    },
    options,
  );
}
