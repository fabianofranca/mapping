// Arrival marks on the canvas (stage #659, PE3, decision 8): the "Came from <name>" badge on each root
// that arrived in Main from another perspective and the dashed "Arrival area" strip. Pure function
// over the drawn project, memoized by its version (the project object): pan and zoom do not go
// through here; the badge size (in screen pixels) enters only in `arrivalBadgeSpot`, at draw
// time. The renderer only draws.
import {
  arrivalHasReference,
  boundingBox,
  bottom,
  projectIndex,
  right,
  rootFootprint,
  type Project,
  type Rect,
} from '../model';
import type { CanvasTokens } from './theme';
import type { Point } from './viewport';

/** The badge measures (screen px), from the canvas tokens (`size-cv-arrival-*`). */
export type ArrivalMetrics = CanvasTokens['arrival'];

/** Slack of the strip around the roots with a mark (canvas units). */
export const ARRIVAL_BAND_PAD = 24;
/** Extra slack (screen px) that Fit all leaves around when there is a strip: its label fits. */
export const ARRIVAL_FIT_EXTRA = 48;

/** A badge to draw: the root, the name of the source perspective and the root's footprint (canvas). */
export interface ArrivalBadge {
  readonly root: string;
  readonly name: string;
  readonly rect: Rect;
}

/** A canvas root: the id (so the root does not block itself) and its footprint. */
export interface ArrivalRoot {
  readonly id: string;
  readonly rect: Rect;
}

export interface ArrivalMarks {
  readonly badges: readonly ArrivalBadge[];
  /** The "Arrival area" strip (canvas, with slack); `null` when there is nothing to wrap. */
  readonly band: Rect | null;
  /** The footprint of each root (canvas): the badge of a small root avoids them. */
  readonly roots: readonly ArrivalRoot[];
}

/**
 * The strip: `project.arrivals` does not record whether the root went to the arrival area or near the
 * reference; that is deduced from the current arrows (`arrivalHasReference`, the same rule as the place
 * search), in the session and after reloading. It wraps only the roots with a mark **without a reference**
 * (`orphans`) and only exists when their box is to the right of all the other roots, with or
 * without a mark (that is where the arrival area opens columns, `perspectivePlace.ts`); those with a reference
 * get only the badge.
 */
function bandOf(project: Project, orphans: ReadonlySet<string>): Rect | null {
  const rects: Rect[] = [];
  for (const id of orphans) {
    const rect = rootFootprint(project, id);
    if (rect) rects.push(rect);
  }
  const area = boundingBox(rects);
  if (!area) return null;
  for (const id of projectIndex(project).roots) {
    if (orphans.has(id)) continue;
    const rect = rootFootprint(project, id);
    if (rect && right(rect) > area.x) return null;
  }
  const pad = ARRIVAL_BAND_PAD;
  return {
    x: area.x - pad,
    y: area.y - pad,
    width: area.width + 2 * pad,
    height: area.height + 2 * pad,
  };
}

function compute(project: Project): ArrivalMarks | null {
  const badges: ArrivalBadge[] = [];
  for (const a of project.arrivals) {
    const rect = rootFootprint(project, a.root);
    if (rect) badges.push({ root: a.root, name: a.fromName, rect });
  }
  if (badges.length === 0) return null;
  const orphans = new Set(
    badges.filter((b) => !arrivalHasReference(project, b.root)).map((b) => b.root),
  );
  const roots: ArrivalRoot[] = [];
  for (const id of projectIndex(project).roots) {
    const rect = rootFootprint(project, id);
    if (rect) roots.push({ id, rect });
  }
  return { badges, band: bandOf(project, orphans), roots };
}

const memo = new WeakMap<Project, ArrivalMarks | null>();

/** The arrival marks of the drawn project; `null` with none (nothing to draw). */
export function arrivalMarks(project: Project | null): ArrivalMarks | null {
  if (!project || project.arrivals.length === 0) return null;
  if (!memo.has(project)) memo.set(project, compute(project));
  return memo.get(project) ?? null;
}

/** Badge width (screen px): grows with the text. */
export function arrivalBadgeWidth(text: string, metrics: ArrivalMetrics): number {
  return text.length * metrics.charWidth + 2 * metrics.pad;
}

/**
 * Where the badge goes (its top-left corner, in canvas units). Never at the top of the root,
 * where the container name and the strip title are. Large root: inside the bottom-left
 * corner; if that crosses the name band (or the body) of another root, raised to just above it;
 * then, the places of the small root (below, right, left). The first without a block wins;
 * with none free, the one with the smallest intersection. `self` is the id of the badge's root: it does not block itself.
 * Size and gap in screen px. With `view` (the visible area, in canvas units) the badge is pulled
 * into it; with `avoid` (a rectangle overlaid on the canvas, like the minimap) it moves out from
 * under it. Both adjustments apply to each candidate before the choice (a place pushed
 * into the view cannot land on another root's title), and `extra` are other rectangles to
 * avoid, like the strip title (CL1, findings 1.2 and 2.1). A small root with no free place still
 * tries its inner corner, the only one that covers just its own root.
 */
export function arrivalBadgeSpot(
  rect: Rect,
  zoom: number,
  width: number,
  metrics: ArrivalMetrics,
  view?: Rect,
  avoid?: Rect,
  roots: readonly ArrivalRoot[] = [],
  self?: string,
  extra: readonly Rect[] = [],
): Point {
  const w = width / zoom;
  const h = metrics.height / zoom;
  const nameBand = metrics.nameBand / zoom;
  const blockers = [
    ...roots
      .filter((r) => r.id !== self)
      .map(({ rect: r }) => ({
        x: r.x,
        y: r.y - nameBand,
        width: r.width,
        height: r.height + nameBand,
      })),
    ...extra,
  ];
  const small = rect.width * zoom < 2 * width || rect.height * zoom < 2 * metrics.height;
  const around = smallCandidates(rect, zoom, w, h, metrics);
  const within = insideCandidates(rect, zoom, w, h, metrics, blockers);
  const candidates = (small ? [...around, ...within] : [...within, ...around]).map((c) =>
    fitToView(c, w, h, view, avoid),
  );
  return pickSpot(candidates, w, h, blockers);
}

/** The candidate pulled into the visible area and out of the minimap, when there is one. */
function fitToView(at: Point, w: number, h: number, view?: Rect, avoid?: Rect): Point {
  if (!view) return at;
  const inside = keepInside(at, w, h, view);
  return avoid ? clearOf(inside, w, h, view, avoid) : inside;
}

/** Inside the root, at the bottom corner; raised above what covers it. */
function insideCandidates(
  rect: Rect,
  zoom: number,
  w: number,
  h: number,
  metrics: ArrivalMetrics,
  blockers: readonly Rect[],
): Point[] {
  const gap = metrics.gap / zoom;
  const inside = { x: rect.x + gap, y: bottom(rect) - gap - h };
  const list = [inside];
  const covering = blockers.filter((r) => hits(inside, w, h, r));
  if (covering.length > 0) {
    const y = Math.min(...covering.map((r) => r.y)) - gap - h;
    if (y >= rect.y + metrics.nameBand / zoom) list.push({ x: inside.x, y });
  }
  return list;
}

/** Small root: below the bottom-left corner, to the right of the root and to its left. */
function smallCandidates(
  rect: Rect,
  zoom: number,
  w: number,
  h: number,
  metrics: ArrivalMetrics,
): Point[] {
  const gap = metrics.gap / zoom;
  return [
    { x: rect.x, y: bottom(rect) + metrics.gapBelow / zoom },
    { x: right(rect) + gap, y: bottom(rect) + gap - h },
    { x: rect.x - gap - w, y: bottom(rect) + gap - h },
  ];
}

/** Area of the intersection of the badge at `at` (w × h) with `r`. */
function overlapArea(at: Point, w: number, h: number, r: Rect): number {
  const dx = Math.min(at.x + w, right(r)) - Math.max(at.x, r.x);
  const dy = Math.min(at.y + h, bottom(r)) - Math.max(at.y, r.y);
  return dx > 0 && dy > 0 ? dx * dy : 0;
}

/** The first candidate with no intersection with `blockers`; with none, the smallest area (tie: the first). */
function pickSpot(
  candidates: readonly Point[],
  w: number,
  h: number,
  blockers: readonly Rect[],
): Point {
  let best = candidates[0] as Point;
  let bestArea = Infinity;
  for (const c of candidates) {
    const area = blockers.reduce((sum, r) => sum + overlapArea(c, w, h, r), 0);
    if (area === 0) return c;
    if (area < bestArea) {
      best = c;
      bestArea = area;
    }
  }
  return best;
}

const hits = (at: Point, w: number, h: number, r: Rect): boolean =>
  at.x < right(r) && at.x + w > r.x && at.y < bottom(r) && at.y + h > r.y;

/** Takes the badge out from under `avoid` (the minimap): to its left; with no room, upward. */
function clearOf(at: Point, w: number, h: number, view: Rect, avoid: Rect): Point {
  if (!hits(at, w, h, avoid)) return at;
  const left = { x: avoid.x - w, y: at.y };
  if (left.x >= view.x) return left;
  return { x: at.x, y: Math.max(view.y, avoid.y - h) };
}

function clampAxis(at: number, size: number, start: number, length: number): number {
  return Math.max(start, Math.min(at, start + length - size));
}

function keepInside(at: Point, w: number, h: number, view: Rect): Point {
  return {
    x: clampAxis(at.x, w, view.x, view.width),
    y: clampAxis(at.y, h, view.y, view.height),
  };
}

/** The slack that is missing (screen px) between the strip and the line of the container names. */
function nameClearance(zoom: number, nameClear: number): number {
  return Math.max(0, nameClear - ARRIVAL_BAND_PAD * zoom);
}

/** The visible area (canvas units) minus the margin of `tokens.arrival.pad` on each side. */
function labelArea(view: Rect, zoom: number, pad: number): Rect {
  const m = pad / zoom;
  return {
    x: view.x + m,
    y: view.y + m,
    width: Math.max(0, view.width - 2 * m),
    height: Math.max(0, view.height - 2 * m),
  };
}

/**
 * The width (screen px) the strip's label takes when the text, of `textWidth`, does not
 * fit in the visible area minus the two margins (title and hint get `width`, `wrap: 'none'` and
 * ellipsis); `null` when it fits.
 */
export function arrivalBandLabelFit(
  textWidth: number,
  zoom: number,
  view: Rect,
  metrics: ArrivalMetrics,
): number | null {
  const room = labelArea(view, zoom, metrics.pad).width * zoom;
  return textWidth > room ? room : null;
}

/**
 * Where the strip's label ("Arrival area" and the hint) goes (its top-left corner, in
 * canvas units). `size` is its size in screen px and `nameClear` the height (screen px) of the
 * container names, which sit just above the content. The strip's slack is in canvas units and
 * shrinks with the zoom; that is why the label rises as much as needed to stay above the name line, never
 * over it. With no room above in the visible area, it goes below the strip; in any case it is pulled
 * into `view`, `metrics.pad` from each edge; wider than that, it uses the width that is left.
 */
export function arrivalBandLabelSpot(
  band: Rect,
  zoom: number,
  size: { readonly width: number; readonly height: number },
  view: Rect,
  nameClear: number,
  metrics: ArrivalMetrics,
): Point {
  const area = labelArea(view, zoom, metrics.pad);
  const w = Math.min(size.width / zoom, area.width);
  const h = size.height / zoom;
  const lift = (nameClearance(zoom, nameClear) + metrics.gap) / zoom;
  const above = band.y - lift - h;
  const y = above >= area.y ? above : bottom(band) + metrics.gap / zoom;
  return keepInside({ x: band.x, y }, w, h, area);
}
