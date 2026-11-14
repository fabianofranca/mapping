import { isFreeRect, nearestFreeSpotIn } from './containers';
import {
  containsRect,
  imageCanvasRect,
  imagePixelRect,
  rectsOverlap,
  sameRect,
} from './geometry';
import { enclosingAmong } from './hierarchySettle';
import { projectIndex } from './projectIndex';
import type { Marking, Project, Rect } from './types';

// Placement of a new piece in free space (stage #1087, decisions 3 to 5): the level where it
// goes (the placement parent), the area it fits in and the obstacles it cannot cover or
// coincide with. Pure functions, no DOM; the parent that gets written is still chosen by the
// settle, through geometry.

/** Where a new piece can be born: the placement parent, the area it fits in and what blocks it. */
export interface PlacementLevel {
  /** The smallest marking in the space that contains the requested rectangle (and differs from it); `null` = the root. */
  readonly parent: Marking | null;
  /** The rectangle of `parent`, the image or, on the canvas without `parent`, none (`null`: no limit). */
  readonly area: Rect | null;
  /** Every non-floating marking that crosses `area`, except the parent and the ancestors; on the canvas, also the containers. */
  readonly obstacles: readonly Rect[];
}

/** Ids of the non-floating markings of `containerId` that contain `rect` and are not equal to it. */
function containingIds(p: Project, containerId: string | null, rect: Rect): Set<string> {
  const ids = new Set<string>();
  for (const m of p.markings) {
    if (m.floating || m.containerId !== containerId) continue;
    if (containsRect(m.rect, rect) && !sameRect(m.rect, rect)) ids.add(m.id);
  }
  return ids;
}

/**
 * The placement parent: the smallest non-floating marking of `containerId` that contains
 * `rect` and **is not equal to it** (an equal rectangle is a sibling, not a parent). In a chain
 * of equal rectangles, the innermost (the one the settle picks, `enclosingAmong`).
 */
function levelParent(p: Project, containerId: string | null, rect: Rect): Marking | null {
  const candidates = containingIds(p, containerId, rect);
  // A single candidate is the parent without ordering the space (rank only breaks ties among several).
  const [only] = candidates;
  const id =
    candidates.size === 1 && only !== undefined
      ? only
      : enclosingAmong(p, containerId, candidates, null);
  return id === null ? null : (projectIndex(p).markings.get(id) ?? null);
}

/** The marking and its ancestors (through the `parentId` chain, with a guard against cycles). */
function lineage(p: Project, marking: Marking): Set<string> {
  const byId = projectIndex(p).markings;
  const ids = new Set<string>();
  let current: Marking | undefined = marking;
  while (current !== undefined && !ids.has(current.id)) {
    ids.add(current.id);
    current = current.parentId === null ? undefined : byId.get(current.parentId);
  }
  return ids;
}

function levelArea(p: Project, containerId: string | null, parent: Marking | null) {
  if (parent !== null) return parent.rect;
  const image =
    containerId === null ? undefined : projectIndex(p).containers.get(containerId);
  return image === undefined ? null : imagePixelRect(image);
}

function levelObstacles(
  p: Project,
  containerId: string | null,
  area: Rect | null,
  excluded: ReadonlySet<string>,
): Rect[] {
  const crosses = (r: Rect): boolean => area === null || rectsOverlap(r, area);
  const obstacles: Rect[] = [];
  for (const m of p.markings) {
    if (m.floating || m.containerId !== containerId || excluded.has(m.id)) continue;
    if (crosses(m.rect)) obstacles.push(m.rect);
  }
  if (containerId === null) {
    for (const c of p.containers) {
      const canvas = imageCanvasRect(c, c.placement);
      if (crosses(canvas)) obstacles.push(canvas);
    }
  }
  return obstacles;
}

/**
 * The placement level of `rect` (R0) in space `containerId` (`null` = canvas). With `target`
 * (component with a slot), the level is the target's and the area is the slot's box.
 */
export function placementLevel(
  p: Project,
  containerId: string | null,
  rect: Rect,
  target?: { readonly parent: Marking; readonly area: Rect },
): PlacementLevel {
  const parent = target?.parent ?? levelParent(p, containerId, rect);
  const area = target?.area ?? levelArea(p, containerId, parent);
  const excluded = parent === null ? new Set<string>() : lineage(p, parent);
  return { parent, area, obstacles: levelObstacles(p, containerId, area, excluded) };
}

/** Is the rectangle free at the level (fits in the area and does not overlap an obstacle)? */
export function isFreeInLevel(level: PlacementLevel, rect: Rect): boolean {
  return isFreeRect(rect, level.obstacles, level.area);
}

/**
 * `rect` (R0) if it is already free; otherwise the free spot nearest to it with the same size;
 * `null` if there is none in the area (the caller goes back to the previous position, no error).
 */
export function freeRectIn(level: PlacementLevel, rect: Rect): Rect | null {
  if (isFreeInLevel(level, rect)) return rect;
  const spot = nearestFreeSpotIn(
    level.obstacles,
    rect.width,
    rect.height,
    rect,
    level.area,
  );
  return spot === null ? null : { ...spot, width: rect.width, height: rect.height };
}

function overlapArea(a: Rect, b: Rect): number {
  const w = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x);
  const h = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y);
  return w > 0 && h > 0 ? w * h : 0;
}

/** Candidate positions of `rect` in the area, every half size (plus that of `rect` clamped to the area). */
function crowdedCandidates(area: Rect, rect: Rect): Rect[] {
  const maxX = area.x + area.width - rect.width;
  const maxY = area.y + area.height - rect.height;
  const stepX = Math.max(1, Math.floor(rect.width / 2));
  const stepY = Math.max(1, Math.floor(rect.height / 2));
  const xs = new Set<number>([Math.min(Math.max(rect.x, area.x), maxX)]);
  const ys = new Set<number>([Math.min(Math.max(rect.y, area.y), maxY)]);
  for (let x = area.x; x <= maxX; x += stepX) xs.add(x);
  for (let y = area.y; y <= maxY; y += stepY) ys.add(y);
  const out: Rect[] = [];
  for (const x of xs) for (const y of ys) out.push({ ...rect, x, y });
  return out;
}

/** Every candidate coincides with some piece: shifts `rect` one pixel at a time diagonally until none contains it. */
function nudgedOut(obstacles: readonly Rect[], area: Rect, rect: Rect): Rect {
  const maxX = area.x + area.width - rect.width;
  const maxY = area.y + area.height - rect.height;
  for (let k = 1; k <= 64; k += 1) {
    const cand = {
      ...rect,
      x: Math.min(rect.x + k, maxX),
      y: Math.min(rect.y + k, maxY),
    };
    if (!obstacles.some((o) => containsRect(o, cand))) return cand;
  }
  return rect;
}

function bestCrowded(level: PlacementLevel, area: Rect, rect: Rect): Rect | null {
  let best: { rect: Rect; cost: number; dist: number } | null = null;
  for (const cand of crowdedCandidates(area, rect)) {
    if (level.obstacles.some((o) => containsRect(o, cand))) continue;
    const cost = level.obstacles.reduce((sum, o) => sum + overlapArea(o, cand), 0);
    const dist = Math.abs(cand.x - rect.x) + Math.abs(cand.y - rect.y);
    const better =
      best === null || cost < best.cost || (cost === best.cost && dist < best.dist);
    if (better) best = { rect: cand, cost, dist };
  }
  return best?.rect ?? null;
}

/**
 * No free spot in the area (the piece will end up over others): the position that covers the
 * others least and, mainly, that none of them contains or equals (otherwise the settle would
 * make it a child of the sibling and not of the level). Tie: the nearest to `rect`. If none
 * contains it, or without an area, `rect`.
 */
export function crowdedRectIn(level: PlacementLevel, rect: Rect): Rect {
  const { area } = level;
  if (!level.obstacles.some((o) => containsRect(o, rect))) return rect;
  if (area === null || rect.width > area.width || rect.height > area.height) return rect;
  return bestCrowded(level, area, rect) ?? nudgedOut(level.obstacles, area, rect);
}
