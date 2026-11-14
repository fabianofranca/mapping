// What a touch or drag would do at a canvas point: pan, move/resize
// the selected item, draw, pick an item or select by touch.
// Pure functions (no DOM or Konva), tested in `tests/canvas/input/`.
import {
  canEditArrow,
  canEditImagePlacement,
  canEditMarkingGeometry,
  canMoveItems,
  imageCanvasRect,
  markingCanvasRectOf,
  projectIndex,
  type Marking,
  type MarkingVisibility,
  type Project,
  type ProjectContainer,
  type Rect,
  type ThreadAnchor,
} from '../../model';
import {
  resolveSelection,
  type EditorMode,
  type Selection,
  type SelectionItem,
} from '../../store/ui';
import {
  arrowHandleAt,
  arrowsAt,
  isOnLinkHandle,
  type ArrowHandle,
  type ArrowShape,
} from '../arrowGeometry';
import type { DragMode } from '../gestureMachine';
import {
  cornerAt,
  containerTitleAt,
  imageAt,
  pointInRect,
  type Corner,
} from '../imageGeometry';
import {
  canvasToImagePixel,
  floatingAt,
  handleHitRadius,
  markingCanvasRect,
  markingChainAt,
  nextInChain,
} from '../markingGeometry';
import type { Point } from '../viewport';

export { ABSORB_TOLERANCE } from '../containment';

/** Distance (screen px) within which a new touch counts as "at the same point". */
export const TAP_REPEAT_DISTANCE = 12;
/** Half of the handle's touch area (screen px): 22 → 44 px, above the 24 minimum. */
export const HANDLE_HIT_RADIUS = 22;

export type Intent =
  | { readonly kind: 'pan' }
  | { readonly kind: 'move-image'; readonly containerId: string }
  | {
      readonly kind: 'resize-image';
      readonly containerId: string;
      readonly corner: Corner;
    }
  | { readonly kind: 'move-marking'; readonly markingId: string }
  | {
      readonly kind: 'resize-marking';
      readonly markingId: string;
      readonly corner: Corner;
    }
  /** Draw: null `containerId` = in the empty canvas (canvas marking). */
  | { readonly kind: 'draw'; readonly containerId: string | null }
  /**
   * Multiple selection (ME2): dragging any selected item takes the whole selection, each
   * item in its own space (`moveItems`). Takes the items that existed when the pointer was pressed.
   */
  | { readonly kind: 'move-items'; readonly items: readonly SelectionItem[] }
  /**
   * Link handle of the selected marking (ME4): pulling from it to another marking creates an arrow
   * that leaves the selected one.
   */
  | { readonly kind: 'arrow-link'; readonly markingId: string }
  /**
   * Handle of the selected arrow (ME4): the tip (switch marking or side), a waypoint
   * (move) or the middle of a segment (dragging creates a waypoint).
   */
  | {
      readonly kind: 'arrow-handle';
      readonly arrowId: string;
      readonly handle: ArrowHandle;
    }
  /** On the selected, locked item: dragging does nothing ("not allowed" cursor). */
  | { readonly kind: 'locked' }
  /**
   * Rectangle selection (SM2): Shift+drag where, without Shift, there would be pan or drawing. Adds to the
   * selection the items entirely inside the rectangle; does not change the project.
   */
  | { readonly kind: 'select-rect' };

const PAN: Intent = { kind: 'pan' };
const LOCKED: Intent = { kind: 'locked' };
const RECT_SELECT: Intent = { kind: 'select-rect' };

/** Editor state that decides the intent (read without subscribing, at the moment of the event). */
export interface IntentContext {
  readonly project: Project | null;
  readonly readOnly: boolean;
  readonly mode: EditorMode;
  /** Primary item of the selection (the last clicked): it is the one with handles. */
  readonly selection: Selection;
  /**
   * All the selected items that exist in the project, the primary last. With two or more,
   * dragging inside any of them moves the whole selection; with just one, `selection` applies.
   */
  readonly items: readonly SelectionItem[];
  /**
   * Visibility of the markings in the display mode: a hidden marking does not count as "inside"
   * (it does not appear on screen), but is still moved with the selection. Without the map, all count.
   */
  readonly visibility?: ReadonlyMap<string, MarkingVisibility>;
  /**
   * Arrows drawn (both ends in view, "Show arrows" on, outside view mode): what the
   * touch reaches and where the selected arrow's handles are. Without the field, there is no arrow on touch.
   */
  readonly arrows?: readonly ArrowShape[];
  /**
   * Rectangles of the names above the containers (canvas): dragging by the selected container's name
   * moves it. Without the field, the name does not count.
   */
  readonly titles?: ReadonlyMap<string, Rect>;
  /** Screen pixels per canvas unit. */
  readonly zoom: number;
  /** Space pressed: dragging always pans. */
  readonly spaceDown: boolean;
  /**
   * Shift pressed with the mouse (left button) outside the review: the drag that would pan or
   * draw becomes `select-rect`, even in read-only. Only the pointer touch turns it on.
   */
  readonly rectSelect?: boolean;
  /**
   * A perspective is open (stage #659, decision 5): what only applies in the Main one does not start.
   * It does not draw in the empty canvas (canvas marking) and does not touch the arrow's waypoints;
   * drawing inside a container and the arrow's tips continue.
   */
  readonly perspectiveOpen?: boolean;
}

/**
 * What a drag starting at `c` (canvas) would do. In Navigate, the handles of the
 * selected item resize and dragging the item moves it; with several items selected, the handles
 * remain only the primary's and dragging inside any selected item moves all
 * (`move-items`, or `locked` if any cannot go). In Draw,
 * dragging always creates a marking (without handles, so as not to disturb drawing children near
 * the parent's corners): over an image, attached to it; in the void, a canvas marking. Pan
 * in Draw mode stays with the space bar, the middle button and the wheel.
 */
export function intentAt(ctx: IntentContext, c: Point): Intent {
  const intent = baseIntentAt(ctx, c);
  const swap = ctx.rectSelect && ctx.project && !ctx.spaceDown;
  return swap && (intent.kind === 'pan' || intent.kind === 'draw') ? RECT_SELECT : intent;
}

function baseIntentAt(ctx: IntentContext, c: Point): Intent {
  const { project, zoom } = ctx;
  if (ctx.spaceDown || !project || ctx.readOnly) return PAN;
  if (ctx.mode === 'draw') {
    const image = imageAt(project.containers, c);
    // In a perspective, the canvas marking (outside a container) belongs only to the Main one.
    if (!image && ctx.perspectiveOpen) return PAN;
    return { kind: 'draw', containerId: image?.id ?? null };
  }
  if (ctx.items.length >= 2) return multiIntentAt(ctx, project, c);
  const selected = resolveSelection(project, ctx.selection);
  if (selected?.kind === 'arrow')
    return arrowIntentAt(ctx, project, selected.arrow.id, c) ?? PAN;
  if (selected?.kind === 'marking') {
    const rect = markingCanvasRect(selected.space.placement, selected.marking.rect);
    // The link handle sits outside the rectangle and also applies when locked: creating the arrow does not change the
    // marking.
    if (isOnLinkHandle(rect, c, zoom)) {
      return { kind: 'arrow-link', markingId: selected.marking.id };
    }
    const radius = handleHitRadius(Math.min(rect.width, rect.height) * zoom) / zoom;
    const markingId = selected.marking.id;
    // Locked (it or an ancestor): no handles and no moving. Locked descendants do not
    // count: moving the parent takes them along.
    const editable = canEditMarkingGeometry(project, markingId);
    const corner = editable ? cornerAt(rect, c, radius) : null;
    if (corner) return { kind: 'resize-marking', markingId, corner };
    if (pointInRect(c, rect)) {
      return editable ? { kind: 'move-marking', markingId } : LOCKED;
    }
  }
  if (selected?.kind === 'image') {
    const { image } = selected;
    const rect = imageCanvasRect(image, image.placement);
    const onTitle = onContainerTitle(ctx, image.id, c);
    if (!canEditImagePlacement(project, image.id)) {
      return pointInRect(c, rect) || onTitle ? LOCKED : PAN;
    }
    const corner = cornerAt(rect, c, HANDLE_HIT_RADIUS / zoom);
    if (corner) return { kind: 'resize-image', containerId: image.id, corner };
    if (pointInRect(c, rect) || onTitle) {
      return { kind: 'move-image', containerId: image.id };
    }
  }
  return PAN;
}

/** Is the point on the label of the name of container `id` (`ctx.titles`)? */
function onContainerTitle(ctx: IntentContext, id: string, c: Point): boolean {
  const title = ctx.titles?.get(id);
  return title !== undefined && pointInRect(c, title);
}

/**
 * Multiple selection: the primary's handles resize the primary; outside them, a point inside the
 * rectangle (in the canvas) of any selected item starts the joint drag, if all can go
 * (all or nothing), or it is `locked`; outside all of them, pan.
 */
function multiIntentAt(ctx: IntentContext, project: Project, c: Point): Intent {
  const { items, zoom } = ctx;
  const selected = resolveSelection(project, ctx.selection);
  if (selected?.kind === 'arrow') {
    // The primary arrow's handles apply with several items; outside them, the rest of the joint drag.
    const arrowIntent = arrowIntentAt(ctx, project, selected.arrow.id, c);
    if (arrowIntent) return arrowIntent;
  }
  if (selected?.kind === 'marking') {
    const rect = markingCanvasRect(selected.space.placement, selected.marking.rect);
    const radius = handleHitRadius(Math.min(rect.width, rect.height) * zoom) / zoom;
    const markingId = selected.marking.id;
    const corner = canEditMarkingGeometry(project, markingId)
      ? cornerAt(rect, c, radius)
      : null;
    if (corner) return { kind: 'resize-marking', markingId, corner };
  } else if (selected?.kind === 'image') {
    const { image } = selected;
    const corner = canEditImagePlacement(project, image.id)
      ? cornerAt(imageCanvasRect(image, image.placement), c, HANDLE_HIT_RADIUS / zoom)
      : null;
    if (corner) return { kind: 'resize-image', containerId: image.id, corner };
  }
  const index = projectIndex(project);
  const inside = items.some((item) => {
    if (item.kind === 'image') {
      const container = index.containers.get(item.id);
      return (
        container !== undefined &&
        (pointInRect(c, imageCanvasRect(container, container.placement)) ||
          onContainerTitle(ctx, item.id, c))
      );
    }
    const marking = index.markings.get(item.id);
    if (!marking || ctx.visibility?.get(item.id) === 'hidden') return false;
    return pointInRect(c, markingCanvasRectOf(project, marking));
  });
  if (!inside) return PAN;
  return canMoveItems(project, items) ? { kind: 'move-items', items } : LOCKED;
}

/**
 * The intent of a point on the selected arrow (the primary): one of its handles, or `locked` over the
 * stroke of a locked arrow (no handles); `null` outside the handles. An arrow that is not
 * drawn (hidden end, "Show arrows" off) has no handles.
 */
function arrowIntentAt(
  ctx: IntentContext,
  project: Project,
  arrowId: string,
  c: Point,
): Intent | null {
  const shape = ctx.arrows?.find((s) => s.arrow.id === arrowId);
  if (!shape) return null;
  if (!canEditArrow(project, arrowId)) {
    return arrowsAt([shape], c, ctx.zoom).length > 0 ? LOCKED : null;
  }
  const handle = arrowHandleAt(shape, c, ctx.zoom);
  // In a perspective, only the arrow's tips move: the route (waypoints) belongs to the Main one.
  if (handle && ctx.perspectiveOpen && handle.kind !== 'end') return null;
  return handle ? { kind: 'arrow-handle', arrowId, handle } : null;
}

/** Markings that accept touch: those hidden by the display mode are left out. */
export function selectableMarkings(
  project: Project,
  visibility: ReadonlyMap<string, MarkingVisibility>,
): readonly Marking[] {
  return project.markings.filter((m) => visibility.get(m.id) !== 'hidden');
}

/** Was the touch at `c` near the previous one (`last`), in screen px? */
export function isRepeatTap(last: Point | null, c: Point, zoom: number): boolean {
  return (
    last !== null && Math.hypot(c.x - last.x, c.y - last.y) * zoom <= TAP_REPEAT_DISTANCE
  );
}

/** Item that a touch can select. */
export type HitItem = NonNullable<Selection>;

/** The arrows the touch reaches: the drawn ones and the zoom (the reach is in screen px). */
export interface ArrowHit {
  readonly shapes: readonly ArrowShape[];
  readonly zoom: number;
}

/**
 * Everything a touch at `c` (canvas) reaches, from the first to receive the touch to the last (the chain
 * of "click again goes up"):
 *
 * 1. the floating markings under the point, wherever they are (the top one first);
 * 1b. the arrows within `ARROW_HIT_TOLERANCE` screen px of the point (`arrows`; the nearest first);
 * 1c. the name label above a container (`titles`): the container and the canvas markings that
 *    contain it, even if it is entirely covered with markings;
 * 2. inside a container: the innermost marking → the ancestors → the container → the canvas markings
 *    that contain it (through the container's `parentId` chain) → the other canvas
 *    markings overlapping the point;
 * 3. outside the containers: the canvas markings under the point, the innermost first and then the
 *    ancestors.
 *
 * Markings hidden by visibility are left out.
 */
export function hitChain(
  project: Project,
  visibility: ReadonlyMap<string, MarkingVisibility>,
  c: Point,
  arrows?: ArrowHit,
  titles?: ReadonlyMap<string, Rect>,
): HitItem[] {
  const markings = selectableMarkings(project, visibility);
  const selectable = new Set(markings.map((m) => m.id));
  const chain: HitItem[] = [];
  const seen = new Set<string>();
  const add = (pick: HitItem) => {
    const key = `${pick.kind}:${pick.id}`;
    if (seen.has(key)) return;
    seen.add(key);
    chain.push(pick);
  };
  for (const m of floatingAt(markings, c)) add({ kind: 'marking', id: m.id });
  // The arrows stay above the markings and the containers, and below the floating ones.
  if (arrows) {
    for (const shape of arrowsAt(arrows.shapes, c, arrows.zoom)) {
      add({ kind: 'arrow', id: shape.arrow.id });
    }
  }
  // The canvas markings that contain the container, from the inside out.
  const addCanvasParents = (container: ProjectContainer) => {
    const byId = projectIndex(project).markings;
    let parentId = container.parentId;
    for (let guard = byId.size; parentId !== null && guard > 0; guard--) {
      const parent = byId.get(parentId);
      if (!parent) break;
      if (selectable.has(parent.id)) add({ kind: 'marking', id: parent.id });
      parentId = parent.parentId;
    }
  };
  const titled = titles ? containerTitleAt(project.containers, titles, c) : null;
  if (titled) {
    add({ kind: 'image', id: titled.id });
    addCanvasParents(titled);
  }
  const image = imageAt(project.containers, c);
  if (image) {
    const pixel = canvasToImagePixel(image.placement, c);
    for (const m of markingChainAt(markings, image.id, pixel)) {
      add({ kind: 'marking', id: m.id });
    }
    add({ kind: 'image', id: image.id });
    addCanvasParents(image);
  }
  for (const m of markingChainAt(markings, null, c)) add({ kind: 'marking', id: m.id });
  return chain;
}

/**
 * Selection after a touch at `c`: the first of the chain (`hitChain`); touching again at the same
 * point (`repeat`) goes up one step and, after the last, returns to the first. Outside everything, nothing.
 */
export function tapSelection(
  project: Project | null,
  selection: Selection,
  visibility: ReadonlyMap<string, MarkingVisibility>,
  c: Point,
  repeat: boolean,
  arrows?: ArrowHit,
  titles?: ReadonlyMap<string, Rect>,
): Selection {
  if (!project) return null;
  const chain = hitChain(project, visibility, c, arrows, titles);
  const keyOf = (pick: HitItem) => `${pick.kind}:${pick.id}`;
  const next = nextInChain(chain.map(keyOf), selection ? keyOf(selection) : null, repeat);
  return chain.find((pick) => keyOf(pick) === next) ?? null;
}

/** The `point` anchor of the click at `c` (canvas): in the highest container under it, or in the canvas. */
export function pointAnchorAt(
  project: Project,
  c: Point,
): Extract<ThreadAnchor, { kind: 'point' }> {
  const image = imageAt(project.containers, c);
  if (!image) return { kind: 'point', containerId: null, x: c.x, y: c.y };
  const pixel = canvasToImagePixel(image.placement, c);
  return { kind: 'point', containerId: image.id, x: pixel.x, y: pixel.y };
}

/**
 * Where the Comment button's click opens the thread (decision 25): on the marking or arrow under `c`
 * (the innermost) or, in an empty place of the canvas or of a container, at a point (`pointAnchorAt`).
 */
export function commentAnchorAt(
  project: Project,
  visibility: ReadonlyMap<string, MarkingVisibility>,
  c: Point,
  arrows?: ArrowHit,
  titles?: ReadonlyMap<string, Rect>,
): ThreadAnchor {
  const hit = hitChain(project, visibility, c, arrows, titles).find(
    (item) => item.kind !== 'image',
  );
  if (hit) return { kind: hit.kind, id: hit.id };
  return pointAnchorAt(project, c);
}

export function dragModeOf(intent: Intent): DragMode {
  if (intent.kind === 'pan' || intent.kind === 'draw') return intent.kind;
  if (intent.kind === 'select-rect') return 'select';
  return intent.kind === 'move-image' ||
    intent.kind === 'move-marking' ||
    intent.kind === 'move-items' ||
    intent.kind === 'locked'
    ? 'move'
    : 'resize';
}

/** Mouse cursor resting over a point with the given intent. */
export function cursorFor(intent: Intent): string {
  switch (intent.kind) {
    case 'move-image':
    case 'move-marking':
    case 'move-items':
      return 'move';
    case 'resize-image':
    case 'resize-marking':
      return intent.corner === 'nw' || intent.corner === 'se'
        ? 'nwse-resize'
        : 'nesw-resize';
    case 'draw':
    case 'select-rect':
      return 'crosshair';
    case 'locked':
      return 'not-allowed';
    case 'arrow-link':
      return 'crosshair';
    case 'arrow-handle':
      if (intent.handle.kind === 'segment') {
        return intent.handle.axis === 'x' ? 'ew-resize' : 'ns-resize';
      }
      return intent.handle.kind === 'end' ? 'crosshair' : 'move';
    case 'pan':
      return '';
  }
}
