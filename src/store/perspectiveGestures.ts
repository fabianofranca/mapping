import * as model from '../model';
import type {
  ItemRef,
  Marking,
  Perspective,
  Placement,
  Project,
  ProjectContainer,
  Rect,
  RectOptions,
  RootMove,
  SettleOptions,
} from '../model';
import type { ArrivalInfo } from './perspectives';

// The project actions with a perspective open (stage #659, PE2, decision 5). The canvas draws
// `perspectiveView(project, perspective)` and calls the SAME actions with coordinates IN THE VIEW; here
// they become what actually changes: dragging a root changes only its position in the perspective (only
// `perspectives[].items`), what is inside a container follows the usual geometry, and what
// decides membership (drawing on the canvas, arrow route, arranging, deleting a root) only applies in the
// Main one. Convention of the `…InView` functions: they return `null` when the perspective is `null` (the
// Main one) or when the model's usual rule applies; the caller falls back to the model operation.

/** Command refused outside the Main one; `project.ts` returns it as the `principal-only` code. */
export class PrincipalOnlyError extends Error {
  constructor() {
    super('principal-only');
    this.name = 'PrincipalOnlyError';
  }
}

function refusePrincipalOnly(): never {
  throw new PrincipalOnlyError();
}

/** Refuses (`principal-only`) the arrow-route and arrange commands in a perspective. */
export function requirePrincipal(perspective: Perspective | null): void {
  if (perspective !== null) refusePrincipalOnly();
}

/** Refuses (`principal-only`) deleting a root in a perspective; the others go ahead. */
export function refuseRootDeletion(
  p: Project,
  perspective: Perspective | null,
  ids: readonly string[],
): void {
  if (perspective !== null && ids.some((id) => model.isRootId(p, id))) {
    refusePrincipalOnly();
  }
}

export type PrincipalOnlyCommand = 'draw-canvas' | 'arrow-route' | 'arrange' | 'delete';

/**
 * Does the interface disable the command with the hint "only in Main"? `true` when there is a
 * perspective open in `p` and the command only applies outside it: drawing a canvas marking that is not
 * floating (`draw-canvas`), editing an arrow's route (`arrow-route`), arranging (`arrange`) and
 * deleting a root (`delete`, with the ids in `targets`: one being a root is enough).
 */
export function principalOnly(
  p: Project,
  perspectiveId: string | null,
  command: PrincipalOnlyCommand,
  targets: readonly string[] = [],
): boolean {
  const open = perspectiveId === null ? undefined : findPerspective(p, perspectiveId);
  if (!open) return false;
  return command === 'delete' ? targets.some((id) => model.isRootId(p, id)) : true;
}

function findPerspective(p: Project, id: string): Perspective | undefined {
  return p.perspectives.find((x) => x.id === id);
}

function perspectiveIn(p: Project, id: string): Perspective {
  return findPerspective(p, id) ?? model.fail('not-found', id);
}

// ---------------------------------------------------------------------------
// Moving roots in the perspective

/**
 * Checks that the containers of the moved roots do not overlap other containers of the view (the view
 * only has the containers of the perspective's roots): `image-overlap`, as in the Main one.
 */
function assertNoViewOverlap(
  p: Project,
  perspectiveId: string,
  roots: readonly string[],
): void {
  const members = model.projectIndex(p).rootMembers;
  const moved = new Set<string>();
  for (const root of roots) {
    for (const c of members.get(root)?.containers ?? []) moved.add(c.id);
  }
  if (moved.size === 0) return;
  const view = model.perspectiveView(p, perspectiveIn(p, perspectiveId));
  const footprints = view.containers.map((c) => ({
    container: c,
    rect: model.imageCanvasRect(c, c.placement),
  }));
  const fixed = footprints.filter((f) => !moved.has(f.container.id));
  for (const m of footprints) {
    if (!moved.has(m.container.id)) continue;
    const other = fixed.find((f) => model.rectsOverlap(m.rect, f.rect));
    if (other)
      model.fail('image-overlap', undefined, { containerId: other.container.id });
  }
}

/**
 * The displacement `dx`, `dy` of the `roots` in the view, reduced to the largest that does not overlap a container of the
 * view that stays put (axis by axis: it touches and slides). With a root that is a canvas marking the
 * displacement is whole, as in `moveRootsInPerspective`. A displacement that fits comes back unchanged.
 */
function touchingViewDelta(
  p: Project,
  perspective: Perspective,
  roots: readonly string[],
  dx: number,
  dy: number,
): { readonly dx: number; readonly dy: number } {
  const members = model.projectIndex(p).rootMembers;
  const moved = new Set<string>();
  for (const root of roots) {
    for (const c of members.get(root)?.containers ?? []) moved.add(c.id);
  }
  const whole = roots.some((root) => model.isMarkingRoot(p, root));
  const shown = model.perspectiveView(p, perspective).containers;
  const footprint = (c: ProjectContainer) => model.imageCanvasRect(c, c.placement);
  return model.touchDelta(
    shown.filter((c) => moved.has(c.id)).map(footprint),
    shown.filter((c) => !moved.has(c.id)).map(footprint),
    dx,
    dy,
    whole,
  );
}

/** Moves the roots in the perspective (`moveRootsInPerspective`) and checks the overlap in the view. */
function moveRootsChecked(
  p: Project,
  perspectiveId: string,
  moves: readonly RootMove[],
): Project {
  const next = model.moveRootsInPerspective(p, perspectiveId, moves);
  if (next !== p)
    assertNoViewOverlap(
      next,
      perspectiveId,
      moves.map((m) => m.root),
    );
  return next;
}

/** The root of a container or marking (`not-found` if the id does not exist). */
function rootOrFail(p: Project, id: string): string {
  return model.perspectiveRootOf(p, id) ?? model.fail('not-found', id);
}

/** Moves the item's root by the displacement (whole if the root is a marking). */
function moveRootOf(
  p: Project,
  perspective: Perspective,
  id: string,
  dx: number,
  dy: number,
): Project {
  const root = rootOrFail(p, id);
  const whole = model.isMarkingRoot(p, root);
  const rdx = whole ? Math.round(dx) : dx;
  const rdy = whole ? Math.round(dy) : dy;
  if (rdx === 0 && rdy === 0) return p;
  return moveRootsChecked(p, perspective.id, [{ root, dx: rdx, dy: rdy }]);
}

function containerOrFail(p: Project, id: string): ProjectContainer {
  return model.projectIndex(p).containers.get(id) ?? model.fail('not-found', id);
}

function markingOrFail(p: Project, id: string): Marking {
  return model.projectIndex(p).markings.get(id) ?? model.fail('not-found', id);
}

// ---------------------------------------------------------------------------
// Container

/** The container's position in the view (what the canvas shows), or `undefined` if it is not in it. */
export function viewPlacement(
  p: Project,
  perspectiveId: string,
  containerId: string,
): Placement | undefined {
  const perspective = findPerspective(p, perspectiveId);
  if (!perspective) return undefined;
  return model
    .projectIndex(model.perspectiveView(p, perspective))
    .containers.get(containerId)?.placement;
}

/**
 * Move or resize the container with the `placement` IN THE VIEW. Moving (same scale) moves the
 * container's root in the perspective: the project does not change, and inside a canvas marking it drags the
 * whole root. Changing the scale is geometry: the root receives only the scale (the Main one's x/y stay) and
 * the requested position goes to its item; a container that is not a root receives the
 * Main position that corresponds to the requested one. The lock and the overlap in the view apply as in the Main one.
 */
export function placementInView(
  p: Project,
  perspective: Perspective | null,
  containerId: string,
  placement: Placement,
  options: SettleOptions,
): Project | null {
  if (perspective === null) return null;
  const own = containerOrFail(p, containerId);
  const shown =
    viewPlacement(p, perspective.id, containerId) ?? model.fail('not-found', containerId);
  model.requireUnlocked(model.canEditImagePlacement(p, containerId));
  const isRoot = model.isRootId(p, containerId);
  const rescaled = placement.scale !== own.placement.scale;
  // Moving (same scale) touches the view container that the pointer would cross.
  const wanted = { dx: placement.x - shown.x, dy: placement.y - shown.y };
  const { dx, dy } = rescaled
    ? wanted
    : touchingViewDelta(
        p,
        perspective,
        [rootOrFail(p, containerId)],
        wanted.dx,
        wanted.dy,
      );
  let next = p;
  if (rescaled) {
    const base = isRoot
      ? own.placement
      : {
          ...own.placement,
          x: model.snapCoordinate(placement.x - (shown.x - own.placement.x)),
          y: model.snapCoordinate(placement.y - (shown.y - own.placement.y)),
        };
    next = model.setContainerPlacement(
      p,
      containerId,
      { ...base, scale: placement.scale },
      options,
    );
  }
  if (isRoot || !rescaled) {
    // `moveRootOf` already checks the overlap when it moves; only what did not move checks here.
    const moved = moveRootOf(next, perspective, containerId, dx, dy);
    if (moved !== next) return moved;
  }
  if (next !== p)
    assertNoViewOverlap(next, perspective.id, [rootOrFail(next, containerId)]);
  return next;
}

// ---------------------------------------------------------------------------
// Canvas marking

/** The marking's rectangle as the canvas shows it (from the view, if there is a perspective). */
export function shownRect(
  p: Project,
  perspective: Perspective | null,
  markingId: string,
): Rect | undefined {
  const index = model.projectIndex(
    perspective === null ? p : model.perspectiveView(p, perspective),
  );
  return (index.markings.get(markingId) ?? model.projectIndex(p).markings.get(markingId))
    ?.rect;
}

/**
 * Move the canvas marking (floating included) by the whole displacement `dx`, `dy`: moves its
 * root in the perspective (a marking that is a child of another drags the whole root). Container
 * marking: `null` (the usual rule).
 */
export function markingMoveInView(
  p: Project,
  perspective: Perspective | null,
  markingId: string,
  dx: number,
  dy: number,
): Project | null {
  if (perspective === null) return null;
  if (!Number.isInteger(dx) || !Number.isInteger(dy)) model.fail('rect-not-integer');
  const marking = markingOrFail(p, markingId);
  if (marking.containerId !== null) return null;
  if (dx === 0 && dy === 0) return p;
  model.requireUnlocked(model.canEditMarkingGeometry(p, markingId));
  return moveRootOf(p, perspective, markingId, dx, dy);
}

/**
 * Change the rectangle (IN THE VIEW) of the canvas marking. The floating one is a root: the size goes to the
 * project (the Main one's x/y stay) and the requested position to the perspective item. One that is not
 * floating decides membership, so it is only resized in the Main one (`principal-only`;
 * coordinator's decision). Container marking: `null`.
 */
export function markingRectInView(
  p: Project,
  perspective: Perspective | null,
  markingId: string,
  rect: Rect,
  options: RectOptions,
): Project | null {
  if (perspective === null) return null;
  const marking = markingOrFail(p, markingId);
  if (marking.containerId !== null) return null;
  const shown = shownRect(p, perspective, markingId) ?? marking.rect;
  const resized = rect.width !== shown.width || rect.height !== shown.height;
  if (!marking.floating)
    return resized
      ? refusePrincipalOnly()
      : markingMoveFrom(p, perspective, markingId, rect, shown);
  const { x, y } = marking.rect;
  const sized = model.setMarkingRect(
    p,
    markingId,
    { x, y, width: rect.width, height: rect.height },
    options,
  );
  return markingMoveFrom(sized, perspective, markingId, rect, shown);
}

/** Moves the marking's root to the requested position (`rect`), starting from `shown`. */
function markingMoveFrom(
  p: Project,
  perspective: Perspective,
  markingId: string,
  rect: Rect,
  shown: Rect,
): Project {
  return (
    markingMoveInView(p, perspective, markingId, rect.x - shown.x, rect.y - shown.y) ?? p
  );
}

/**
 * Fine adjustment through the panel (value IN THE VIEW for `x`/`y`): `x`/`y` move the root of the canvas
 * marking; width and height only for the floating one (the others: `principal-only`). Container marking:
 * `null`.
 */
export function markingAdjustInView(
  p: Project,
  perspective: Perspective | null,
  markingId: string,
  field: keyof Rect,
  value: number,
  options: RectOptions,
): Project | null {
  if (perspective === null) return null;
  const marking = markingOrFail(p, markingId);
  if (marking.containerId !== null) return null;
  if (!Number.isInteger(value)) model.fail('rect-not-integer');
  if (field === 'x' || field === 'y') {
    const shown = shownRect(p, perspective, markingId) ?? marking.rect;
    const delta = value - shown[field];
    return markingMoveInView(
      p,
      perspective,
      markingId,
      field === 'x' ? delta : 0,
      field === 'y' ? delta : 0,
    );
  }
  if (!marking.floating) return refusePrincipalOnly();
  return model.adjustMarkingRect(p, markingId, field, value, options);
}

// ---------------------------------------------------------------------------
// Selection

/** An item that moves in the perspective: a container or canvas marking (its root). */
function rootOfMoving(p: Project, item: ItemRef): string | undefined {
  const index = model.projectIndex(p);
  if (item.kind === 'image') return index.rootOf.get(item.id);
  const marking = index.markings.get(item.id);
  return marking?.containerId === null ? index.rootOf.get(item.id) : undefined;
}

/** The item can change place (own lock or inherited from the ancestors). */
function canGrab(p: Project, item: ItemRef): boolean {
  return item.kind === 'image'
    ? model.canEditImagePlacement(p, item.id)
    : model.canEditMarkingGeometry(p, item.id);
}

/** The drag's items separated: the roots that move in the perspective and the rest, which moves in the project. */
function splitMoving(
  p: Project,
  items: readonly ItemRef[],
): { readonly roots: readonly string[]; readonly rest: readonly ItemRef[] } {
  const moving = model.movingItems(p, items);
  const roots = new Set<string>();
  const others: ItemRef[] = [];
  for (const item of moving) {
    const root = rootOfMoving(p, item);
    if (root === undefined) others.push(item);
    else {
      model.requireUnlocked(canGrab(p, item));
      roots.add(root);
    }
  }
  const index = model.projectIndex(p);
  // A container marking whose root moves goes with the root.
  const rest = others.filter((item) => !roots.has(index.rootOf.get(item.id) ?? ''));
  return { roots: [...roots], rest };
}

/** The drag accepts any finite number; the arrow-key step, only integers. */
function assertValidDelta(
  mode: 'move' | 'nudge',
  delta: { readonly dx: number; readonly dy: number },
): void {
  const valid = mode === 'move' ? Number.isFinite : Number.isInteger;
  if (!valid(delta.dx) || !valid(delta.dy)) model.fail('invalid-placement');
}

/**
 * Joint drag (`'move'`, canvas units) or arrow-key step (`'nudge'`, integers) with a
 * perspective open: the roots of containers and canvas markings move in the perspective
 * (without repeating; with a root marking the canvas displacement is rounded once for all) and the
 * container markings whose root does not move follow `moveItems`/`nudgeItems`, in the same operation.
 */
export function itemsMoveInView(
  p: Project,
  perspective: Perspective | null,
  items: readonly ItemRef[],
  delta: { readonly dx: number; readonly dy: number },
  mode: 'move' | 'nudge',
  options: SettleOptions,
): Project | null {
  if (perspective === null) return null;
  assertValidDelta(mode, delta);
  if (delta.dx === 0 && delta.dy === 0) return p;
  const { roots, rest } = splitMoving(p, items);
  // The drag touches (decision 4 of stage #764); the arrow-key step keeps refusing.
  const { dx, dy } =
    mode === 'move'
      ? touchingViewDelta(p, perspective, roots, delta.dx, delta.dy)
      : delta;
  let next = p;
  if (rest.length > 0) {
    next =
      mode === 'move'
        ? model.moveItems(p, rest, dx, dy, options)
        : model.nudgeItems(p, rest, dx, dy, options);
  }
  const whole = roots.some((root) => model.isMarkingRoot(p, root));
  const moves = roots.map((root) => ({
    root,
    dx: whole ? Math.round(dx) : dx,
    dy: whole ? Math.round(dy) : dy,
  }));
  return moves.length === 0 ? next : moveRootsChecked(next, perspective.id, moves);
}

// ---------------------------------------------------------------------------
// Criar numa perspectiva

/**
 * After an operation that creates (`before` → `after`) with perspective `perspectiveId` open:
 * a new canvas marking that is not floating refuses (`principal-only`); each new root (container
 * without a parent or floating) enters the perspective at the position it has in the project and arrives in the Main one
 * (`arriveInPrincipal`), one at a time. Returns the project and the arrivals (for the notice).
 */
export function creationInPerspective(
  before: Project,
  after: Project,
  perspectiveId: string,
): { readonly project: Project; readonly arrivals: readonly ArrivalInfo[] } {
  if (!findPerspective(after, perspectiveId)) return { project: after, arrivals: [] };
  const known = model.projectIndex(before);
  const isNew = (id: string) => !known.containers.has(id) && !known.markings.has(id);
  const created = after.markings.filter((m) => isNew(m.id));
  if (created.some((m) => m.containerId === null && !m.floating)) refusePrincipalOnly();
  const roots = model.projectIndex(after).roots.filter(isNew);
  let project = after;
  const arrivals: ArrivalInfo[] = [];
  for (const root of roots) {
    const entered = enterPerspective(project, perspectiveId, root);
    const arrived = model.arriveInPrincipal(
      entered,
      root,
      perspectiveIn(entered, perspectiveId),
    );
    project = arrived.project;
    arrivals.push({
      root,
      from: perspectiveId,
      kind: arrived.kind,
      referenceId: arrived.referenceId,
    });
  }
  return { project, arrivals };
}

/** Adds the root to the perspective, at the position it has in the project. */
function enterPerspective(p: Project, perspectiveId: string, root: string): Project {
  const open = perspectiveIn(p, perspectiveId);
  const at = model.placeCreatedRoot(p, open, root);
  return {
    ...p,
    perspectives: p.perspectives.map((x) =>
      x.id === perspectiveId
        ? {
            ...x,
            items: [
              ...x.items.filter((i) => i.root !== root),
              { root, x: at.x, y: at.y },
            ],
          }
        : x,
    ),
  };
}
