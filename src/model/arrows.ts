import { fail } from './errors';
import { right, bottom, toCanvasPoint } from './geometry';
import {
  CANVAS_SPACE,
  containerSpace,
  markingCanvasRectOf,
  type Space,
} from './hierarchySettle';
import { canEditArrow, requireUnlocked } from './locks';
import { findById, normalizeOptionalName, updateById } from './project';
import { projectIndex, idInUse } from './projectIndex';
import { countBrokenRefs } from './refs';
import {
  ARROW_SIDES,
  ARROW_STYLES,
  DEFAULT_ARROW_STYLE,
  type Arrow,
  type ArrowPoint,
  type ArrowSide,
  type ArrowStyle,
  type Project,
  type Rect,
} from './types';

// Arrows (Spatial markings stage, ME4; decision 14): an arrow is a marking that points. It links
// two MARKINGS (`from`, `to`; never another arrow or a container), has its own route (`points`)
// and style and can have annotations per layer (`annotations[].markingId` = the arrow's id; the
// ids of arrows and those of markings share the same space). It stays outside the ownership
// tree: it has no `rect`, container or parent, and nothing carries it along in a drag. Pure,
// immutable functions.

/** Arrow endpoint: the origin (`from`) or the destination (`to`). */
export type ArrowEnd = 'from' | 'to';

// ---------------------------------------------------------------------------
// Queries

/**
 * Arrows attached to the marking, in array order: those that leave it (`outgoing`, it is the
 * origin) and those that arrive at it (`incoming`, it is the destination).
 */
export function arrowsOf(
  p: Project,
  markingId: string,
): { readonly outgoing: Arrow[]; readonly incoming: Arrow[] } {
  const attached = projectIndex(p).arrowsByMarking.get(markingId) ?? [];
  return {
    outgoing: attached.filter((a) => a.from === markingId),
    incoming: attached.filter((a) => a.to === markingId),
  };
}

/** An arrow attached to the marking, with the side it is on and the marking at the other end. */
export interface ArrowLink {
  readonly arrow: Arrow;
  /**
   * `out`: the marking is the origin (the arrow leaves it); `in`: it is the destination (the arrow
   * arrives at it).
   */
  readonly direction: 'out' | 'in';
  /** The marking at the other end. */
  readonly otherId: string;
}

/**
 * The arrows attached to the marking, for the "Linked by arrow" section: first those that leave,
 * then those that arrive, each group in the project's `arrows` order.
 */
export function arrowLinksOf(p: Project, markingId: string): ArrowLink[] {
  const { outgoing, incoming } = arrowsOf(p, markingId);
  return [
    ...outgoing.map((arrow) => ({ arrow, direction: 'out' as const, otherId: arrow.to })),
    ...incoming.map((arrow) => ({
      arrow,
      direction: 'in' as const,
      otherId: arrow.from,
    })),
  ];
}

/**
 * Container where the arrow appears in the review and in the lists: the origin marking's; `null`
 * = the canvas (origin on the canvas or nonexistent).
 */
export function arrowContainerId(p: Project, arrow: Pick<Arrow, 'from'>): string | null {
  return projectIndex(p).markings.get(arrow.from)?.containerId ?? null;
}

/**
 * Space of the arrow's `points`, derived from the two endpoints and never saved (decision (d)):
 * the container's when both markings belong to the same container; in any other case (different
 * containers, an endpoint on the canvas or floating, a nonexistent endpoint), the canvas.
 */
export function arrowPointsSpace(p: Project, arrow: Pick<Arrow, 'from' | 'to'>): Space {
  const index = projectIndex(p);
  const from = index.markings.get(arrow.from);
  const to = index.markings.get(arrow.to);
  if (!from || !to || from.containerId === null || from.containerId !== to.containerId) {
    return CANVAS_SPACE;
  }
  const container = index.containers.get(from.containerId);
  return container ? containerSpace(container) : CANVAS_SPACE;
}

// ---------------------------------------------------------------------------
// Route

/** Midpoint of the rectangle's side. */
export function sideAnchor(rect: Rect, side: ArrowSide): ArrowPoint {
  switch (side) {
    case 'top':
      return { x: rect.x + rect.width / 2, y: rect.y };
    case 'bottom':
      return { x: rect.x + rect.width / 2, y: bottom(rect) };
    case 'left':
      return { x: rect.x, y: rect.y + rect.height / 2 };
    case 'right':
      return { x: right(rect), y: rect.y + rect.height / 2 };
  }
}

/**
 * Automatic side: the box's side facing `target`, by the dominant axis of the center → target
 * vector. A tie (and a target at the center) goes to the horizontal axis.
 */
export function autoArrowSide(rect: Rect, target: ArrowPoint): ArrowSide {
  const dx = target.x - (rect.x + rect.width / 2);
  const dy = target.y - (rect.y + rect.height / 2);
  if (Math.abs(dx) >= Math.abs(dy)) return dx >= 0 ? 'right' : 'left';
  return dy >= 0 ? 'bottom' : 'top';
}

/**
 * A middle segment of an `elbow` arrow that the person can move in parallel ("lane"): `axis` is
 * the coordinate it fixes (`x` on a vertical segment, `y` on a horizontal one) and `value` its
 * value, in canvas units.
 */
export interface ElbowLane {
  readonly axis: 'x' | 'y';
  readonly value: number;
}

/** The arrow's polyline in canvas units and the sides on which it attaches to the markings. */
export interface ArrowRoute {
  /** Exit anchor, waypoints (already on the canvas) and arrival anchor. */
  readonly points: readonly ArrowPoint[];
  readonly fromSide: ArrowSide;
  readonly toSide: ArrowSide;
  /**
   * `elbow` only: the middle segments, in stroke order. Lane `j` is the stretch between
   * `points[j + 1]` and `points[j + 2]`. Empty in the other styles and in a single-bend corner.
   */
  readonly lanes: readonly ElbowLane[];
}

function centerOf(rect: Rect): ArrowPoint {
  return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
}

/**
 * Minimum stretch (canvas units) the corner runs when leaving and arriving perpendicular to the
 * side.
 */
export const ELBOW_STUB = 16;

function sideNormal(side: ArrowSide): ArrowPoint {
  switch (side) {
    case 'top':
      return { x: 0, y: -1 };
    case 'bottom':
      return { x: 0, y: 1 };
    case 'left':
      return { x: -1, y: 0 };
    case 'right':
      return { x: 1, y: 0 };
  }
}

const transpose = (pt: ArrowPoint): ArrowPoint => ({ x: pt.y, y: pt.x });

/**
 * The corner router (without obstacle avoidance): a polyline made only of horizontal and
 * vertical stretches, in canvas units.
 *
 * The stroke is a sequence of segments that alternate direction. The first leaves the anchor `a`
 * perpendicular to the side `fromSide` and the last arrives at the anchor `b` perpendicular to
 * `toSide`. The middle segments ("lanes") are what `points` controls: **each waypoint fixes one
 * middle segment**, in stroke order, and only the coordinate perpendicular to the segment counts
 * (the `x` on a vertical segment, the `y` on a horizontal one; the other is ignored, and the
 * gesture stores the segment's middle there). Moving a marking then stretches only the first or
 * the last segment.
 *
 * `points` is only valid if the count matches the sides: odd when the first and last segments
 * are parallel (both horizontal or both vertical), even when they are perpendicular. Otherwise,
 * and when empty, the default route applies: the shortest one that leaves and arrives at the
 * right side, with a minimum stretch of `ELBOW_STUB` (one lane in the Z or C, none in the L,
 * three or two when the sides do not allow a short path); it follows the markings.
 */
function elbowRoute(
  a: ArrowPoint,
  fromSide: ArrowSide,
  b: ArrowPoint,
  toSide: ArrowSide,
  given: readonly ArrowPoint[],
): { readonly points: ArrowPoint[]; readonly lanes: ElbowLane[] } {
  // Works with the first segment horizontal (transposes x and y when it is vertical).
  const swap = fromSide === 'top' || fromSide === 'bottom';
  const f = (pt: ArrowPoint): ArrowPoint => (swap ? transpose(pt) : pt);
  const A = f(a);
  const B = f(b);
  const sx = f(sideNormal(fromSide)).x;
  const nb = f(sideNormal(toSide));
  const parallel = nb.y === 0;
  const axisOf = (j: number): 'x' | 'y' => ((j % 2 === 0) !== swap ? 'x' : 'y');

  let values: number[];
  if (given.length > 0 && given.length % 2 === (parallel ? 1 : 0)) {
    values = given.map((pt, j) => pt[axisOf(j)]);
  } else if (parallel) {
    const tx = nb.x;
    if (sx === tx) {
      values = [
        sx > 0 ? Math.max(A.x, B.x) + ELBOW_STUB : Math.min(A.x, B.x) - ELBOW_STUB,
      ];
    } else if ((B.x - A.x) * sx >= 2 * ELBOW_STUB) {
      values = [(A.x + B.x) / 2];
    } else {
      values = [A.x + sx * ELBOW_STUB, (A.y + B.y) / 2, B.x + tx * ELBOW_STUB];
    }
  } else {
    const ty = nb.y;
    const direct = (B.x - A.x) * sx >= ELBOW_STUB && (A.y - B.y) * ty >= ELBOW_STUB;
    values = direct ? [] : [A.x + sx * ELBOW_STUB, B.y + ty * ELBOW_STUB];
  }

  // Segment i (1 to n): horizontal on the odd ones, vertical on the even ones; `fixed` is the
  // coordinate it fixes. Each corner takes the `x` of the vertical and the `y` of the horizontal.
  const n = values.length + 2;
  const fixed = (i: number): number => {
    if (i === 1) return A.y;
    if (i === n) return parallel ? B.y : B.x;
    return values[i - 2] as number;
  };
  const corners: ArrowPoint[] = [];
  for (let i = 1; i < n; i++) {
    corners.push(
      i % 2 === 1 ? { x: fixed(i + 1), y: fixed(i) } : { x: fixed(i), y: fixed(i + 1) },
    );
  }
  return {
    points: [A, ...corners, B].map(f),
    lanes: values.map((value, j) => ({ axis: axisOf(j), value })),
  };
}

/**
 * The arrow's complete route, **in canvas units**, for drawing and hit-testing: exit anchor,
 * waypoints (converted from their space, `arrowPointsSpace`) and arrival anchor. The anchor is
 * the midpoint of the side; the `null` (automatic) side is the box's side facing the next point
 * (the first waypoint, or the center of the other endpoint; on arrival, the last waypoint or
 * the center of the origin). `null` if an endpoint does not exist.
 *
 * `straight` and `curve` have the same polyline (the curve is only the drawing's smoothing). The
 * `elbow` swaps the polyline for the orthogonal path from `elbowRoute`, in which the waypoints
 * are middle segments; its automatic side looks only at the center of the other marking (a
 * waypoint fixes only one coordinate, it does not point anywhere).
 */
export function arrowRoute(p: Project, arrow: Arrow): ArrowRoute | null {
  const markings = projectIndex(p).markings;
  const from = markings.get(arrow.from);
  const to = markings.get(arrow.to);
  if (!from || !to) return null;
  const fromRect = markingCanvasRectOf(p, from);
  const toRect = markingCanvasRectOf(p, to);
  const { placement } = arrowPointsSpace(p, arrow);
  const via = arrow.points.map((pt) => toCanvasPoint(placement, pt));
  const elbow = arrow.style === 'elbow';
  const fromSide =
    arrow.fromSide ?? autoArrowSide(fromRect, (!elbow && via[0]) || centerOf(toRect));
  const toSide =
    arrow.toSide ??
    autoArrowSide(toRect, (!elbow && via[via.length - 1]) || centerOf(fromRect));
  const a = sideAnchor(fromRect, fromSide);
  const b = sideAnchor(toRect, toSide);
  if (elbow) return { ...elbowRoute(a, fromSide, b, toSide, via), fromSide, toSide };
  return { points: [a, ...via, b], fromSide, toSide, lanes: [] };
}

// ---------------------------------------------------------------------------
// Cascade (deleting a marking, container or selection takes the attached arrows along)

/** Ids of the arrows attached to any of the markings (as origin or destination). */
export function arrowIdsAttachedTo(
  p: Project,
  markingIds: ReadonlySet<string>,
): Set<string> {
  const byMarking = projectIndex(p).arrowsByMarking;
  const ids = new Set<string>();
  for (const id of markingIds) {
    for (const arrow of byMarking.get(id) ?? []) ids.add(arrow.id);
  }
  return ids;
}

/**
 * The project without the arrows in `arrowIds` and without their annotations. Does not check the
 * lock.
 */
export function withoutArrows(p: Project, arrowIds: ReadonlySet<string>): Project {
  if (arrowIds.size === 0) return p;
  return {
    ...p,
    arrows: p.arrows.filter((a) => !arrowIds.has(a.id)),
    annotations: p.annotations.filter((a) => !arrowIds.has(a.markingId)),
  };
}

// ---------------------------------------------------------------------------
// Operations

/**
 * The owner of an annotation exists: a marking or an arrow (v13; the ids share the space).
 * Fails with `not-found`.
 */
export function requireAnnotationOwner(p: Project, ownerId: string): void {
  const index = projectIndex(p);
  if (!index.markings.has(ownerId) && !index.arrows.has(ownerId)) {
    fail('not-found', ownerId);
  }
}

function checkEndpoint(p: Project, id: string): void {
  const index = projectIndex(p);
  if (index.markings.has(id)) return;
  if (index.arrows.has(id)) fail('arrow-endpoint', id);
  fail('not-found', id);
}

function checkSide(side: ArrowSide | null): void {
  if (side !== null && !ARROW_SIDES.includes(side)) fail('invalid-value', String(side));
}

function checkStyle(style: ArrowStyle): void {
  if (!ARROW_STYLES.includes(style)) fail('invalid-value', String(style));
}

export interface NewArrowArgs {
  readonly id: string;
  /** Origin marking. */
  readonly from: string;
  /** Destination marking, different from the origin. */
  readonly to: string;
  /** Default: `curve`. */
  readonly style?: ArrowStyle;
  readonly name?: string | null;
  /** `null` or absent = automatic side. */
  readonly fromSide?: ArrowSide | null;
  readonly toSide?: ArrowSide | null;
}

/**
 * Creates the arrow between two markings. The endpoints must exist and be markings (neither
 * another arrow, `arrow-endpoint`; nor a container, which is not among the markings) and be
 * different (`arrow-self`); the id must not repeat that of a marking or of another arrow. It
 * starts with the default route (`points: []`, only the person draws waypoints), unlocked. Two
 * equal arrows are allowed.
 */
export function createArrow(p: Project, args: NewArrowArgs): Project {
  if (idInUse(p, args.id)) fail('duplicate-id', args.id);
  checkEndpoint(p, args.from);
  checkEndpoint(p, args.to);
  if (args.from === args.to) fail('arrow-self', args.from);
  const style = args.style ?? DEFAULT_ARROW_STYLE;
  const fromSide = args.fromSide ?? null;
  const toSide = args.toSide ?? null;
  checkStyle(style);
  checkSide(fromSide);
  checkSide(toSide);
  const arrow: Arrow = {
    id: args.id,
    from: args.from,
    to: args.to,
    fromSide,
    toSide,
    points: [],
    style,
    name: normalizeOptionalName(args.name ?? null),
    locked: false,
  };
  return { ...p, arrows: [...p.arrows, arrow] };
}

/**
 * Deletes the arrow and its annotations (those linked by `parentAnnotationId` belong to the same
 * owner and go together). Fails with `locked` if the arrow is locked.
 */
export function removeArrow(p: Project, arrowId: string): Project {
  findById(p.arrows, arrowId);
  requireUnlocked(canEditArrow(p, arrowId));
  return withoutArrows(p, new Set([arrowId]));
}

/**
 * What goes along with the arrow: its annotations and the references from others that would break.
 */
export function arrowDeletionImpact(
  p: Project,
  arrowId: string,
): { annotations: number; brokenRefs: number } {
  findById(p.arrows, arrowId);
  return {
    annotations: (projectIndex(p).annotationsByMarking.get(arrowId) ?? []).length,
    brokenRefs: countBrokenRefs(p, withoutArrows(p, new Set([arrowId]))),
  };
}

/**
 * Changes the marking at an endpoint and/or its side (`side` `null` = automatic). If the space of
 * the waypoints changes with the swap (`arrowPointsSpace`), the default route returns (`points`
 * cleared); the new marking cannot be another arrow or the other endpoint. With no change it
 * returns `p` as is, without checking the lock; when locked, it fails with `locked`.
 */
export function setArrowEndpoint(
  p: Project,
  arrowId: string,
  end: ArrowEnd,
  markingId: string,
  side: ArrowSide | null,
): Project {
  const arrow = findById(p.arrows, arrowId);
  checkEndpoint(p, markingId);
  checkSide(side);
  const current = end === 'from' ? arrow.from : arrow.to;
  const currentSide = end === 'from' ? arrow.fromSide : arrow.toSide;
  if (current === markingId && currentSide === side) return p;
  requireUnlocked(canEditArrow(p, arrowId));
  if (markingId === (end === 'from' ? arrow.to : arrow.from))
    fail('arrow-self', markingId);
  const moved: Arrow =
    end === 'from'
      ? { ...arrow, from: markingId, fromSide: side }
      : { ...arrow, to: markingId, toSide: side };
  const spaceChanged =
    arrowPointsSpace(p, moved).containerId !== arrowPointsSpace(p, arrow).containerId;
  const next = spaceChanged && moved.points.length > 0 ? { ...moved, points: [] } : moved;
  return { ...p, arrows: updateById(p.arrows, arrowId, () => next) };
}

function samePoints(a: readonly ArrowPoint[], b: readonly ArrowPoint[]): boolean {
  return (
    a.length === b.length && a.every((pt, i) => pt.x === b[i]?.x && pt.y === b[i]?.y)
  );
}

/**
 * Sets the waypoints (in the space of `arrowPointsSpace`; `[]` goes back to the default route).
 * Finite coordinates. With no change it returns `p` as is, without checking the lock; when
 * locked, it fails with `locked`.
 */
export function setArrowRoute(
  p: Project,
  arrowId: string,
  points: readonly ArrowPoint[],
): Project {
  const arrow = findById(p.arrows, arrowId);
  if (!points.every((pt) => Number.isFinite(pt.x) && Number.isFinite(pt.y))) {
    fail('invalid-arrow-route', arrowId);
  }
  const copy = points.map((pt) => ({ x: pt.x, y: pt.y }));
  if (samePoints(arrow.points, copy)) return p;
  requireUnlocked(canEditArrow(p, arrowId));
  return {
    ...p,
    arrows: updateById(p.arrows, arrowId, (a) => ({ ...a, points: copy })),
  };
}

/**
 * Stroke style (`straight`, `curve` or `elbow`). With no change it returns `p`; when locked,
 * `locked`.
 */
export function setArrowStyle(p: Project, arrowId: string, style: ArrowStyle): Project {
  const arrow = findById(p.arrows, arrowId);
  checkStyle(style);
  if (arrow.style === style) return p;
  requireUnlocked(canEditArrow(p, arrowId));
  return { ...p, arrows: updateById(p.arrows, arrowId, (a) => ({ ...a, style })) };
}

/**
 * Arrow label; empty becomes `null`, as in `renameMarking`. Renaming is not geometry: the lock
 * does not block it (selecting, renaming and annotating stay free).
 */
export function setArrowName(p: Project, arrowId: string, name: string | null): Project {
  const normalized = normalizeOptionalName(name);
  return {
    ...p,
    arrows: updateById(p.arrows, arrowId, (a) => ({ ...a, name: normalized })),
  };
}

/** Locks or unlocks the arrow (only its own: the lock does not come from the endpoints). */
export function setArrowLocked(p: Project, arrowId: string, locked: boolean): Project {
  if (findById(p.arrows, arrowId).locked === locked) return p;
  return { ...p, arrows: updateById(p.arrows, arrowId, (a) => ({ ...a, locked })) };
}
