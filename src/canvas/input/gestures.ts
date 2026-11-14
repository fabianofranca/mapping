// Drag gestures in progress and how each intent starts one. No DOM or
// Konva: the `PointerInput` holds the gesture and feeds it with the events.
import {
  ancestorsOf,
  arrowPointsSpace,
  canEditArrow,
  canMoveItems,
  markingCanvasRectOf,
  projectIndex,
  spaceOf,
  type ArrowEnd,
  type ArrowPoint,
  type ArrowSide,
  type Placement,
  type Project,
  type ProjectContainer,
  type Rect,
} from '../../model';
import { existingItems, type SelectionItem } from '../../store/ui';
import { arrowShape, elbowLanePoints, type ArrowShape } from '../arrowGeometry';
import { absorbCandidates, type AbsorbCandidate } from '../containment';
import type { Draft } from '../frame';
import type { Corner } from '../imageGeometry';
import { canvasToImagePixel, rectFromPoints, type RectLimits } from '../markingGeometry';
import type { Point } from '../viewport';
import type { Intent } from './intents';

export type Gesture =
  /** Pointer pressed, not yet past the drag threshold (may be a click). */
  | {
      readonly kind: 'pending';
      readonly pointerId: number;
      readonly start: Point;
      /** Button pressed: the middle button's short click (pan) is not a tap. */
      readonly button: number;
      /** O que o arrasto faria. */
      intent: Intent;
    }
  | { readonly kind: 'pan'; readonly pointerId: number; last: Point }
  | {
      readonly kind: 'move-image';
      readonly pointerId: number;
      readonly containerId: string;
      readonly startCanvas: Point;
      readonly startPlacement: Placement;
    }
  | {
      readonly kind: 'resize-image';
      readonly pointerId: number;
      readonly containerId: string;
      readonly corner: Corner;
      readonly startPlacement: Placement;
    }
  | {
      readonly kind: 'move-marking';
      readonly pointerId: number;
      readonly markingId: string;
      readonly startCanvas: Point;
      /** Scale of the marking's space: converts the canvas offset into its units. */
      readonly scale: number;
      /** Last offset shown in the preview (units of the marking's space, integers). */
      dx: number;
      dy: number;
    }
  /**
   * Joint drag (ME2): the whole selection moves together. `dx`, `dy` hold the last **valid**
   * offset of the preview (canvas units, unrounded): when a move is refused (all or nothing),
   * the preview stays on it and it is what the release writes.
   */
  | {
      readonly kind: 'move-items';
      readonly pointerId: number;
      readonly items: readonly SelectionItem[];
      readonly startCanvas: Point;
      dx: number;
      dy: number;
    }
  | {
      readonly kind: 'resize-marking';
      readonly pointerId: number;
      readonly markingId: string;
      readonly corner: Corner;
      /** Position of the marking's space: the container's or the identity, on the canvas. */
      readonly placement: Placement;
      readonly startRect: Rect;
      readonly limits: RectLimits;
      /** Items of the space that the resize can absorb on release. */
      readonly candidates: readonly AbsorbCandidate[];
    }
  | {
      readonly kind: 'draw';
      readonly pointerId: number;
      /** Container where the drawing started; `null` = on empty space, drawing on the canvas. */
      readonly image: ProjectContainer | null;
      /** Where it started, in the drawing's space (image pixels or canvas units). */
      readonly startPixel: Point;
      /** Items of the space that the drawing can absorb on release. */
      readonly candidates: readonly AbsorbCandidate[];
    }
  /**
   * Create an arrow by pulling the link handle of the marking `markingId` (ME4): no store gesture; the
   * provisional arrow and the target are in `state.arrowDraft`, and releasing over a marking creates the
   * arrow (`addArrow`).
   */
  | {
      readonly kind: 'arrow-link';
      readonly pointerId: number;
      readonly markingId: string;
      /** Where the provisional arrow starts (canvas): the middle of the marking's right side. */
      readonly origin: Point;
    }
  /**
   * Move a waypoint (`mode` `point`, `index` in `points`) or create one in the middle of a
   * segment (`mode` `mid`, `index` = where it goes in), in the points' space (`placement`). In `elbow`,
   * move a middle segment in parallel (`mode` `segment`, `index` = the lane, `axis` = the
   * coordinate of the point that the pointer changes; `base` already carries one point per lane).
   */
  | {
      readonly kind: 'arrow-route';
      readonly pointerId: number;
      readonly arrowId: string;
      readonly mode: 'point' | 'mid' | 'segment';
      readonly index: number;
      /** Only in `segment`: the coordinate of the points' space that the pointer changes. */
      readonly axis: 'x' | 'y' | null;
      /** The waypoints from before the gesture. */
      readonly base: readonly ArrowPoint[];
      /** Position of the points' space: the container's or the identity, on the canvas. */
      readonly placement: Placement;
    }
  /**
   * Drag an arrow tip to another marking (swaps `from`/`to`) or, over the same one, to another
   * side (swaps `fromSide`/`toSide`). `valid` says whether the pointer is over a target (releasing
   * outside cancels).
   */
  | {
      readonly kind: 'arrow-end';
      readonly pointerId: number;
      readonly arrowId: string;
      readonly end: ArrowEnd;
      /** The marking at the other tip: it cannot be the target. */
      readonly fixed: string;
      /** Where the other tip attaches (canvas): the provisional arrow starts there. */
      readonly fixedAnchor: Point;
      /** The marking and side the tip had (`side` null = automatic). */
      readonly original: { readonly markingId: string; readonly side: ArrowSide | null };
      /** The side the tip attaches to today (the effective one, even with the automatic side). */
      readonly currentSide: ArrowSide;
      valid: boolean;
    }
  /**
   * Rectangle selection (SM2, Shift+drag): no store gesture (the project does not change and nothing
   * goes to undo); the rectangle lives in `state.marquee` and releasing adds the items inside it.
   */
  | {
      readonly kind: 'select-rect';
      readonly pointerId: number;
      /** Where the drag started (canvas): a corner of the rectangle. */
      readonly startCanvas: Point;
    }
  /** Mouse drag over the locked item: does nothing until release ("not allowed" cursor). */
  | { readonly kind: 'blocked'; readonly pointerId: number }
  /** Two fingers. Ends when all of them leave the screen. */
  | { readonly kind: 'pinch' };

/** Gestos que usam `beginGesture/commitGesture` do store. */
export type StoreGesture = Extract<
  Gesture,
  {
    kind:
      | 'move-image'
      | 'resize-image'
      | 'move-marking'
      | 'move-items'
      | 'resize-marking'
      | 'arrow-route'
      | 'arrow-end';
  }
>;

export function isStoreGesture(g: Gesture | null): g is StoreGesture {
  return (
    g?.kind === 'move-image' ||
    g?.kind === 'resize-image' ||
    g?.kind === 'move-marking' ||
    g?.kind === 'move-items' ||
    g?.kind === 'resize-marking' ||
    g?.kind === 'arrow-route' ||
    g?.kind === 'arrow-end'
  );
}

/** Gesture started and, in Draw mode, the initial draft. */
export interface StartedGesture {
  readonly gesture: Gesture;
  readonly draft: Draft | null;
}

/**
 * Starts the intent's gesture, with the pointer at `startCanvas`. `null` if it
 * no longer applies (item removed, editing blocked): the drag becomes a pan.
 * `beginGesture` opens the gesture in the store (one undo entry on release).
 */
export function startGesture(
  project: Project | null,
  pointerId: number,
  startCanvas: Point,
  intent: Intent,
  beginGesture: () => boolean,
): StartedGesture | null {
  if (!project || intent.kind === 'pan') return null;
  if (intent.kind === 'select-rect') {
    return { gesture: { kind: 'select-rect', pointerId, startCanvas }, draft: null };
  }
  if (intent.kind === 'locked') {
    return { gesture: { kind: 'blocked', pointerId }, draft: null };
  }
  const index = projectIndex(project);

  if (intent.kind === 'draw') {
    const image =
      intent.containerId === null
        ? null
        : (index.containers.get(intent.containerId) ?? null);
    if (intent.containerId !== null && !image) return null;
    const startPixel = image
      ? canvasToImagePixel(image.placement, startCanvas)
      : startCanvas;
    return {
      gesture: {
        kind: 'draw',
        pointerId,
        image,
        startPixel,
        candidates: absorbCandidates(project, image?.id ?? null, new Set()),
      },
      draft: {
        containerId: image?.id ?? null,
        rect: rectFromPoints(startPixel, startPixel, image),
      },
    };
  }

  if (intent.kind === 'arrow-link') {
    const origin = index.markings.get(intent.markingId);
    if (!origin) return null;
    const rect = markingCanvasRectOf(project, origin);
    return {
      gesture: {
        kind: 'arrow-link',
        pointerId,
        markingId: origin.id,
        origin: { x: rect.x + rect.width, y: rect.y + rect.height / 2 },
      },
      draft: null,
    };
  }

  if (intent.kind === 'arrow-handle') {
    const arrow = index.arrows.get(intent.arrowId);
    if (!arrow || !canEditArrow(project, arrow.id)) return null;
    const { handle } = intent;
    if (handle.kind === 'end') {
      const shape = arrowShape(project, arrow);
      if (!shape || !beginGesture()) return null;
      return { gesture: arrowEndGesture(pointerId, shape, handle.end), draft: null };
    }
    const { placement } = arrowPointsSpace(project, arrow);
    if (handle.kind === 'segment') {
      const shape = arrowShape(project, arrow);
      if (!shape || !beginGesture()) return null;
      return {
        gesture: {
          kind: 'arrow-route',
          pointerId,
          arrowId: arrow.id,
          mode: 'segment',
          index: handle.index,
          axis: handle.axis,
          base: elbowLanePoints(shape, placement),
          placement,
        },
        draft: null,
      };
    }
    if (!beginGesture()) return null;
    return {
      gesture: {
        kind: 'arrow-route',
        pointerId,
        arrowId: arrow.id,
        mode: handle.kind,
        index: handle.index,
        axis: null,
        base: arrow.points,
        placement,
      },
      draft: null,
    };
  }

  if (intent.kind === 'move-items') {
    // Items that vanished since the touch (undo) are left out; with nothing to move, pan.
    const items = existingItems(project, intent.items);
    if (!canMoveItems(project, items) || !beginGesture()) return null;
    return {
      gesture: { kind: 'move-items', pointerId, items, startCanvas, dx: 0, dy: 0 },
      draft: null,
    };
  }

  if (intent.kind === 'move-image' || intent.kind === 'resize-image') {
    const image = index.containers.get(intent.containerId);
    if (!image || !beginGesture()) return null;
    const gesture: Gesture =
      intent.kind === 'move-image'
        ? {
            kind: 'move-image',
            pointerId,
            containerId: image.id,
            startCanvas,
            startPlacement: image.placement,
          }
        : {
            kind: 'resize-image',
            pointerId,
            containerId: image.id,
            corner: intent.corner,
            startPlacement: image.placement,
          };
    return { gesture, draft: null };
  }

  if (intent.kind !== 'move-marking' && intent.kind !== 'resize-marking') return null;
  const marking = index.markings.get(intent.markingId);
  if (!marking) return null;
  if (marking.containerId !== null && !index.containers.has(marking.containerId)) {
    return null;
  }
  const space = spaceOf(project, marking);
  if (!beginGesture()) return null;
  const gesture: Gesture =
    intent.kind === 'move-marking'
      ? {
          kind: 'move-marking',
          pointerId,
          markingId: marking.id,
          startCanvas,
          scale: space.placement.scale,
          dx: 0,
          dy: 0,
        }
      : {
          kind: 'resize-marking',
          pointerId,
          markingId: marking.id,
          corner: intent.corner,
          placement: space.placement,
          startRect: marking.rect,
          limits: { outer: space.bounds },
          // Absorbs what crosses the rectangle, except itself and the ancestors (which contain it). The
          // floating one absorbs nothing: it stays outside the membership tree both ways.
          candidates: marking.floating
            ? []
            : absorbCandidates(
                project,
                marking.containerId,
                new Set([
                  marking.id,
                  ...ancestorsOf(project, marking.id).map((a) => a.id),
                ]),
              ),
        };
  return { gesture, draft: null };
}

/** O gesto de arrastar a ponta `end` da seta de `shape`. */
function arrowEndGesture(pointerId: number, shape: ArrowShape, end: ArrowEnd): Gesture {
  const { arrow, route } = shape;
  const isFrom = end === 'from';
  const first = route.points[0] as Point;
  const last = route.points[route.points.length - 1] as Point;
  return {
    kind: 'arrow-end',
    pointerId,
    arrowId: arrow.id,
    end,
    fixed: isFrom ? arrow.to : arrow.from,
    fixedAnchor: isFrom ? last : first,
    original: {
      markingId: isFrom ? arrow.from : arrow.to,
      side: isFrom ? arrow.fromSide : arrow.toSide,
    },
    currentSide: isFrom ? route.fromSide : route.toSide,
    valid: true,
  };
}
