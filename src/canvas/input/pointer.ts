// Pointer and wheel input of the canvas: events → `gestureMachine` → intents
// → store actions. Pan, zoom and pinch go to the `ViewportController`; the
// gesture preview goes to the `InteractionState`, which the overlays draw.
import {
  IDENTITY_PLACEMENT,
  MIN_MARKING_SIZE,
  canEditArrow,
  fromCanvasPoint,
  imagePixelRect,
  markingCanvasRectOf,
  projectIndex,
  selectionWithContents,
  spaceOf,
  toCanvasRect,
  type ArrowSide,
  type Placement,
  type Project,
  type Rect,
} from '../../model';
import { t } from '../../i18n';
import type { EditorDerived } from '../../store/derived';
import type { ProjectStore } from '../../store/history';
import type { ProjectActions } from '../../store/project';
import { showArrows } from '../../store/settings';
import {
  addSelectedItems,
  existingItems,
  isItemSelected,
  peekSelectedItems,
  selectItems,
  showToast,
  toggleSelectedItem,
  type EditorUi,
  type Selection,
} from '../../store/ui';
import {
  ABSORB_TOLERANCE,
  absorbInto,
  snapTarget,
  spaceTolerance,
  type AbsorbCandidate,
  type SnapTarget,
} from '../containment';
import {
  arrowHandleAt,
  arrowShape,
  nearestSide,
  visibleArrowShapes,
  type ArrowShape,
} from '../arrowGeometry';
import type { PinPlace } from '../commentPins';
import type { InteractionState } from '../frame';
import { IDLE, stepGesture, type GestureState } from '../gestureMachine';
import { resizeFromCorner } from '../imageGeometry';
import {
  canvasToImagePixel,
  isDrawableRect,
  rectFromPoints,
  resizeMarkingRect,
} from '../markingGeometry';
import { wheelZoomFactor, type Point } from '../viewport';
import type { ViewportController } from '../viewportController';
import { isMultiSelectClick } from '../../utils/platform';
import {
  isStoreGesture,
  startGesture,
  type Gesture,
  type StoreGesture,
} from './gestures';
import { canvasMenuAt, pinTitle, tapComment } from './commentPointer';
import { marqueeItems, rectFromCorners } from './marquee';
import {
  cursorFor,
  dragModeOf,
  hitChain,
  intentAt,
  isRepeatTap,
  tapSelection,
  type ArrowHit,
  type Intent,
  type IntentContext,
} from './intents';

export interface PointerInputOptions {
  readonly container: HTMLElement;
  readonly store: ProjectStore;
  readonly actions: ProjectActions;
  readonly ui: EditorUi;
  readonly derived: EditorDerived;
  readonly viewport: ViewportController;
  readonly state: InteractionState;
  /** Space pressed (dragging pans). */
  readonly spaceDown: () => boolean;
  /** Drawn project (the "how it would look" in review); default: the store's. */
  readonly project?: () => Project | null;
  /** Review open: everything is read-only and the context menu does not open. */
  readonly reviewing?: () => boolean;
  /** A perspective is open: what is "Main only" does not start (see `IntentContext`). */
  readonly perspectiveOpen?: () => boolean;
  /** Rectangles of the names above the containers (canvas), measured by the renderer. */
  readonly containerTitles?: () => ReadonlyMap<string, Rect>;
  /** The thread pin under the canvas point (wins over the marking below); `null` if none. */
  readonly pinAt?: (c: Point) => PinPlace | null;
}

/** Gestures that drag items: the cursor is the move one. */
const MOVE_GESTURES: ReadonlySet<Gesture['kind']> = new Set([
  'move-image',
  'move-marking',
  'move-items',
  'arrow-route',
]);

/** Arrow gestures that pull a line to a marking: the cursor is the aim one. */
const AIM_GESTURES: ReadonlySet<Gesture['kind']> = new Set([
  'arrow-link',
  'arrow-end',
  'select-rect',
]);

/** Gestures without the store that Esc cancels (the store has `cancelGesture`). */
const CANCELLABLE_GESTURES: ReadonlySet<Gesture['kind']> = new Set([
  'draw',
  'arrow-link',
  'select-rect',
]);

function sameRect(a: Rect, b: Rect): boolean {
  return a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height;
}

export class PointerInput {
  private readonly o: PointerInputOptions;
  private readonly pointers = new Map<number, Point>();
  private gesture: Gesture | null = null;
  /** Classification of the gesture in progress (click / pan / move / …). */
  private gestureState: GestureState = IDLE;
  /**
   * Last click (canvas), for the "click again goes up to the parent" cycle. Only valid for
   * consecutive clicks: every touch that stops being a click (drag, cancel, pinch) resets it.
   */
  private lastTap: Point | null = null;
  /** Type of the last pointer pressed: the `contextmenu` of a long touch is not the mouse's. */
  private lastPointerType = 'mouse';
  /** The multi-select modifier (Shift, Cmd or, outside macOS, Ctrl) was pressed when the pointer
  went down: the touch (no drag) toggles the item. */
  private pressShift = false;
  /**
   * Primary selection from before the last touch. The second touch of a double click, landing
   * on the same point, already went up one step in the chain; the double click's target is what
   * the first touch selected, that is, the selection from before the second.
   */
  private selectionBeforeTap: Selection = null;

  constructor(options: PointerInputOptions) {
    this.o = options;
  }

  /** Project in which the touch looks for items (the drawn one). */
  private project(): Project | null {
    return this.o.project ? this.o.project() : this.o.store.project.peek();
  }

  /** Listens to the container's events. Returns the function that stops listening. */
  bind(): () => void {
    const el = this.o.container;
    const cleanups: (() => void)[] = [];
    const on = <K extends keyof HTMLElementEventMap>(
      type: K,
      handler: (e: HTMLElementEventMap[K]) => void,
      options?: AddEventListenerOptions,
    ) => {
      el.addEventListener(type, handler, options);
      cleanups.push(() => el.removeEventListener(type, handler, options));
    };
    on('pointerdown', (e) => this.onPointerDown(e));
    on('pointermove', (e) => this.onPointerMove(e));
    on('pointerup', (e) => this.onPointerUp(e, false));
    on('pointercancel', (e) => this.onPointerUp(e, true));
    on('dblclick', (e) => this.onDoubleClick(e));
    on('wheel', (e) => this.onWheel(e), { passive: false });
    on('contextmenu', (e) => {
      e.preventDefault();
      this.openContextMenu(e);
    });
    return () => {
      for (const cleanup of cleanups.splice(0)) cleanup();
    };
  }

  /** A pointer gesture is in progress (pointer pressed, drag or pinch). */
  isInteracting(): boolean {
    return this.gesture !== null;
  }

  /** Cancels the move/resize/draw gesture in progress. `true` if there was one. */
  cancelInteraction(): boolean {
    const g = this.gesture;
    if (!isStoreGesture(g) && !(g && CANCELLABLE_GESTURES.has(g.kind))) return false;
    if (isStoreGesture(g)) this.o.actions.cancelGesture();
    this.clearTransient();
    this.gesture = { kind: 'pinch' }; // Ignores the rest of the drag until release.
    this.gestureState = { phase: 'pinch' };
    return true;
  }

  /** Clears the preview, the draft and the gesture highlights (snap target, items to absorb). */
  private clearTransient(): void {
    const { state } = this.o;
    state.preview.value = null;
    state.draft.value = null;
    state.moveTarget.value = null;
    if (state.arrowDraft.peek() !== null) state.arrowDraft.value = null;
    if (state.marquee.peek() !== null) state.marquee.value = null;
    if (state.absorb.peek().length > 0) state.absorb.value = [];
  }

  /** Undoes a half-done store gesture. */
  destroy(): void {
    if (isStoreGesture(this.gesture)) this.o.actions.cancelGesture();
  }

  /** Mouse cursor: that of the gesture in progress or that of the intent under `p` (screen). */
  updateCursor(p: Point | null): void {
    const g = this.gesture;
    let cursor: string;
    if (g?.kind === 'pan') cursor = 'grabbing';
    else if (g && MOVE_GESTURES.has(g.kind)) cursor = 'move';
    else if (g?.kind === 'draw' || (g && AIM_GESTURES.has(g.kind))) cursor = 'crosshair';
    else if (g?.kind === 'blocked') cursor = 'not-allowed';
    else if (this.o.spaceDown()) cursor = 'grab';
    else cursor = this.commentCursor(p) ?? (p ? cursorFor(this.intentAt(p)) : '');
    this.o.container.style.cursor = cursor;
  }

  private context(rectSelect = false): IntentContext {
    const { store, ui, derived } = this.o;
    const project = this.project();
    return {
      project,
      readOnly: store.readOnly.peek() || (this.o.reviewing?.() ?? false),
      // View mode never draws, even if the mode is still Draw.
      mode: ui.viewMode.peek() ? 'navigate' : ui.mode.peek(),
      selection: ui.selection.peek(),
      items: existingItems(project, peekSelectedItems(ui)),
      visibility: derived.markingVisibility.peek(),
      arrows: this.arrowShapes(project),
      titles: this.o.containerTitles?.(),
      zoom: this.o.viewport.scale,
      spaceDown: this.o.spaceDown(),
      rectSelect,
      perspectiveOpen: this.o.perspectiveOpen?.() ?? false,
    };
  }

  /** The arrows the touch reaches: the drawn ones ("Show arrows" on, outside view mode). */
  private arrowShapes(project: Project | null): readonly ArrowShape[] {
    if (this.o.ui.viewMode.peek() || !showArrows.peek()) return [];
    return visibleArrowShapes(project, this.o.derived.markingVisibility.peek());
  }

  /** The arrows and the zoom for the touch chain (`hitChain`). */
  private arrowHit(project: Project | null): ArrowHit {
    return { shapes: this.arrowShapes(project), zoom: this.o.viewport.scale };
  }

  /** Intent of a drag starting at `p` (screen); `rectSelect`: Shift pressed with the mouse. */
  private intentAt(p: Point, rectSelect = false): Intent {
    return intentAt(this.context(rectSelect), this.o.viewport.toCanvas(p));
  }

  /** Mouse Shift+drag (left button) outside review makes the selection rectangle. */
  private wantsRectSelect(e: PointerEvent): boolean {
    return (
      e.pointerType === 'mouse' &&
      e.button === 0 &&
      e.shiftKey &&
      !(this.o.reviewing?.() ?? false)
    );
  }

  /** What the drag starting with `e` (at `p`, screen) would do. */
  private pressIntent(e: PointerEvent, p: Point): Intent {
    if (e.button === 1) return { kind: 'pan' };
    // The pin wins over the marking below, and the Comment click does not start a gesture:
    // dragging pans.
    if (this.o.ui.commentArm.peek() !== null || this.pinUnder(p)) return { kind: 'pan' };
    const intent = this.intentAt(p, this.wantsRectSelect(e));
    // On a touch screen, dragging over an item (free or locked) pans, like scrolling the
    // page; handles (resize) and Draw mode stay direct, and the mouse does not change.
    const dragsItem =
      intent.kind === 'locked' ||
      intent.kind === 'move-marking' ||
      intent.kind === 'move-image' ||
      intent.kind === 'move-items';
    return e.pointerType === 'touch' && dragsItem ? { kind: 'pan' } : intent;
  }

  private onPointerDown(e: PointerEvent): void {
    this.lastPointerType = e.pointerType;
    this.pressShift = isMultiSelectClick(e);
    if (e.pointerType === 'mouse' && e.button !== 0 && e.button !== 1) return;
    const p = this.o.viewport.screenPoint(e);
    this.pointers.set(e.pointerId, p);
    try {
      this.o.container.setPointerCapture(e.pointerId);
    } catch {
      // Without capture, the gesture ends if the pointer leaves the canvas.
    }

    if (this.pointers.size >= 2) {
      this.cancelInteraction();
      this.lastTap = null; // The pinch restarts the click cycle.
      this.gesture = { kind: 'pinch' };
      this.gestureState = stepGesture(this.gestureState, {
        type: 'second-pointer',
      }).state;
      return;
    }
    const intent = this.pressIntent(e, p);
    this.gesture = {
      kind: 'pending',
      pointerId: e.pointerId,
      start: p,
      button: e.button,
      intent,
    };
    this.gestureState = stepGesture(IDLE, {
      type: 'down',
      point: p,
      direct: dragModeOf(intent),
    }).state;
  }

  private onPointerMove(e: PointerEvent): void {
    const { viewport, actions } = this.o;
    const p = viewport.screenPoint(e);
    const previous = this.pointers.get(e.pointerId);
    if (!previous) {
      if (e.pointerType === 'mouse') this.updateCursor(p);
      return;
    }
    this.pointers.set(e.pointerId, p);
    const g = this.gesture;
    if (!g) return;

    if (g.kind === 'pinch') {
      const [first, second] = [...this.pointers.entries()];
      if (!first || !second) return;
      const [idA, a1] = first;
      const [idB, b1] = second;
      const a0 = idA === e.pointerId ? previous : a1;
      const b0 = idB === e.pointerId ? previous : b1;
      viewport.pinch(a0, b0, a1, b1);
      return;
    }
    if (g.pointerId !== e.pointerId) return;

    switch (g.kind) {
      case 'pending': {
        const step = stepGesture(this.gestureState, { type: 'move', point: p });
        this.gestureState = step.state;
        if (step.effect.kind === 'start-drag') {
          this.lastTap = null; // Stopped being a click: the next click restarts the cycle.
          this.gesture = this.startDrag(g.pointerId, g.start, g.intent);
          this.onPointerMove(e);
        }
        return;
      }
      case 'pan':
        viewport.panBy(p.x - g.last.x, p.y - g.last.y);
        g.last = p;
        return;
      case 'blocked':
        return;
      case 'select-rect':
        this.moveMarquee(g, p);
        return;
      case 'move-image': {
        const c = viewport.toCanvas(p);
        const { startPlacement: s, startCanvas } = g;
        this.previewPlacement(g.containerId, {
          x: s.x + (c.x - startCanvas.x),
          y: s.y + (c.y - startCanvas.y),
          scale: s.scale,
        });
        return;
      }
      case 'move-items': {
        // Displacement in canvas units, not rounded (the model rounds what it needs).
        // All or nothing: if any item cannot go, the preview stays at the last valid position and
        // that position is what `dx`, `dy` keep for the release.
        const c = viewport.toCanvas(p);
        const dx = c.x - g.startCanvas.x;
        const dy = c.y - g.startCanvas.y;
        if (actions.previewItemsMove(g.items, dx, dy).ok) {
          g.dx = dx;
          g.dy = dy;
        }
        return;
      }
      case 'resize-image': {
        const project = this.project();
        const image = project && projectIndex(project).containers.get(g.containerId);
        if (!image) return;
        const placement = resizeFromCorner(
          image,
          g.startPlacement,
          g.corner,
          viewport.toCanvas(p),
        );
        this.previewPlacement(g.containerId, placement);
        return;
      }
      case 'move-marking': {
        // The canvas displacement becomes units of the marking's space; nothing ties the marking
        // to the container (the new space is decided on release).
        const c = viewport.toCanvas(p);
        g.dx = Math.round((c.x - g.startCanvas.x) / g.scale);
        g.dy = Math.round((c.y - g.startCanvas.y) / g.scale);
        actions.previewMarkingMove(g.markingId, g.dx, g.dy);
        this.updateMoveTarget(g);
        return;
      }
      case 'resize-marking': {
        const pixel = canvasToImagePixel(g.placement, viewport.toCanvas(p));
        actions.previewMarkingRect(
          g.markingId,
          resizeMarkingRect(
            g.startRect,
            g.corner,
            pixel,
            g.limits,
            this.o.derived.componentMinSizes.peek().get(g.markingId),
          ),
        );
        const marking = this.markingNow(g.markingId);
        if (marking) {
          this.updateAbsorb(marking.rect, g.candidates, g.placement, g.limits.outer);
        }
        return;
      }
      case 'arrow-link': {
        const c = viewport.toCanvas(p);
        this.o.state.arrowDraft.value = {
          line: { from: g.origin, to: c },
          target: this.markingUnder(c, g.markingId),
        };
        return;
      }
      case 'arrow-route': {
        // The point goes where the pointer is, in the points' space (rounded container pixels,
        // or canvas units): a new point (`mid`) enters at position `index`.
        const at = fromCanvasPoint(g.placement, viewport.toCanvas(p));
        const point = { x: Math.round(at.x), y: Math.round(at.y) };
        if (g.mode === 'segment') {
          // The segment moves in parallel: only the coordinate perpendicular to it follows the pointer.
          actions.previewArrowRoute(
            g.arrowId,
            g.base.map((q, i) =>
              i !== g.index
                ? q
                : g.axis === 'x'
                  ? { x: point.x, y: q.y }
                  : { x: q.x, y: point.y },
            ),
          );
          return;
        }
        actions.previewArrowRoute(
          g.arrowId,
          g.mode === 'mid'
            ? [...g.base.slice(0, g.index), point, ...g.base.slice(g.index)]
            : g.base.map((q, i) => (i === g.index ? point : q)),
        );
        return;
      }
      case 'arrow-end':
        this.moveArrowEnd(g, viewport.toCanvas(p));
        return;
      case 'draw': {
        const c = viewport.toCanvas(p);
        const pixel = g.image ? canvasToImagePixel(g.image.placement, c) : c;
        const rect = rectFromPoints(g.startPixel, pixel, g.image);
        this.o.state.draft.value = { containerId: g.image?.id ?? null, rect };
        this.updateAbsorb(
          isDrawableRect(rect) ? rect : null,
          g.candidates,
          g.image?.placement ?? IDENTITY_PLACEMENT,
          g.image ? imagePixelRect(g.image) : null,
        );
        return;
      }
    }
  }

  /** The selection rectangle goes from the drag start to the pointer. */
  private moveMarquee(g: Extract<Gesture, { kind: 'select-rect' }>, p: Point): void {
    this.o.state.marquee.value = rectFromCorners(
      g.startCanvas,
      this.o.viewport.toCanvas(p),
    );
  }

  /**
   * Releasing the rectangle adds to the selection the items entirely inside it (removing none);
   * the project does not change. Cancelled, the selection stays as it was. The rectangle always
   * disappears.
   */
  private finishMarquee(
    g: Extract<Gesture, { kind: 'select-rect' }>,
    end: Point,
    cancelled: boolean,
  ): void {
    this.o.state.marquee.value = null;
    const project = this.project();
    if (cancelled || !project) return;
    const items = marqueeItems(project, rectFromCorners(g.startCanvas, end), {
      visibility: this.o.derived.markingVisibility.peek(),
      arrows: this.arrowShapes(project),
    });
    addSelectedItems(this.o.ui, items);
  }

  /**
   * The marking under the canvas point that would receive an arrow's end: the first in the touch
   * chain (floating ones first, hidden ones left out), without `except` itself. `null` in the void.
   */
  private markingUnder(c: Point, except: string | null): string | null {
    const project = this.project();
    if (!project) return null;
    const first = hitChain(project, this.o.derived.markingVisibility.peek(), c).find(
      (item) => item.kind === 'marking',
    );
    return first && first.id !== except ? first.id : null;
  }

  /**
   * Dragging an arrow end: over another marking (other than the other end) the preview links it
   * to it (automatic side); over the same one, on the side closest to the pointer; in the void,
   * the arrow goes back to what it was, shows the provisional line and releasing cancels.
   */
  private moveArrowEnd(g: Extract<Gesture, { kind: 'arrow-end' }>, c: Point): void {
    const { actions, state } = this.o;
    const project = this.project();
    const target = this.markingUnder(c, g.fixed);
    const marking =
      target && project ? projectIndex(project).markings.get(target) : undefined;
    if (!target || !project || !marking) {
      actions.previewArrowEndpoint(
        g.arrowId,
        g.end,
        g.original.markingId,
        g.original.side,
      );
      g.valid = false;
      state.arrowDraft.value = { line: { from: g.fixedAnchor, to: c }, target: null };
      return;
    }
    let side: ArrowSide | null = null;
    if (target === g.original.markingId) {
      // Near another side of the same marking switches the side; on the same one, nothing changes
      // (the automatic side stays automatic).
      const nearest = nearestSide(markingCanvasRectOf(project, marking), c);
      side = nearest === g.currentSide ? g.original.side : nearest;
    }
    g.valid = actions.previewArrowEndpoint(g.arrowId, g.end, target, side).ok;
    state.arrowDraft.value = { line: null, target };
  }

  /** The marking in the store's current project (with the gesture preview). */
  private markingNow(id: string) {
    const project = this.project();
    return project ? projectIndex(project).markings.get(id) : undefined;
  }

  /**
   * Where the dragged marking would go if released now: the container that contains it or the
   * one that receives it by snapping (`snapTarget`), with the extra offset. A floating one never snaps.
   */
  private moveSnap(g: Extract<Gesture, { kind: 'move-marking' }>): {
    readonly snap: SnapTarget | null;
    readonly origin: string | null;
  } {
    const project = this.project();
    const marking = this.markingNow(g.markingId);
    if (!project || !marking) return { snap: null, origin: null };
    if (marking.floating) return { snap: null, origin: marking.containerId };
    // In a perspective the root only moves: snapping into a container belongs to Main (decision 5).
    if (marking.containerId === null && this.o.perspectiveOpen?.()) {
      return { snap: null, origin: null };
    }
    const space = spaceOf(project, marking);
    const snap = snapTarget(
      toCanvasRect(space.placement, marking.rect),
      space.placement,
      project.containers,
      ABSORB_TOLERANCE / this.o.viewport.scale,
    );
    return { snap, origin: marking.containerId };
  }

  /** Lights up the target container while the marking is dragged (if it is not the origin one). */
  private updateMoveTarget(g: Extract<Gesture, { kind: 'move-marking' }>): void {
    const { snap, origin } = this.moveSnap(g);
    const next = snap && snap.containerId !== origin ? snap.containerId : null;
    if (this.o.state.moveTarget.peek() !== next) this.o.state.moveTarget.value = next;
  }

  /**
   * Lights up the items that `rect` would absorb if the gesture ended now (`null` = none). Only
   * writes the signal when the set changes.
   */
  private updateAbsorb(
    rect: Rect | null,
    candidates: readonly AbsorbCandidate[],
    placement: Placement,
    limit: Rect | null,
  ): void {
    const tolerance = spaceTolerance(this.o.viewport.scale, placement.scale);
    const next = rect
      ? absorbInto(rect, candidates, tolerance, limit).absorbed.map((a) =>
          toCanvasRect(placement, a.rect),
        )
      : [];
    const current = this.o.state.absorb.peek();
    if (
      current.length === next.length &&
      current.every((r, i) => sameRect(r, next[i] as Rect))
    ) {
      return;
    }
    this.o.state.absorb.value = next;
  }

  /** Drag gesture; if the intent no longer applies, pan. */
  private startDrag(pointerId: number, start: Point, intent: Intent): Gesture {
    const { actions, viewport, state } = this.o;
    const started = startGesture(
      this.project(),
      pointerId,
      viewport.toCanvas(start),
      intent,
      () => actions.beginGesture().ok,
    );
    if (!started) return { kind: 'pan', pointerId, last: start };
    if (started.draft) state.draft.value = started.draft;
    return started.gesture;
  }

  private previewPlacement(containerId: string, placement: Placement): void {
    const result = this.o.actions.previewImagePlacement(containerId, placement);
    this.o.state.preview.value = {
      containerId: containerId,
      placement,
      valid: result.ok,
    };
  }

  private onPointerUp(e: PointerEvent, cancelled: boolean): void {
    if (!this.pointers.delete(e.pointerId)) return;
    const g = this.gesture;
    if (!g) return;
    if (g.kind === 'pinch') {
      if (this.pointers.size === 0) {
        this.gesture = null;
        this.gestureState = stepGesture(this.gestureState, {
          type: 'all-released',
        }).state;
      }
      return;
    }
    if (g.pointerId !== e.pointerId) return;
    const { actions } = this.o;
    this.gesture = null;
    const step = stepGesture(this.gestureState, { type: cancelled ? 'cancel' : 'up' });
    this.gestureState = step.state;
    if (g.kind === 'pending' && step.effect.kind === 'tap') {
      // The short middle-button click is just the start of a pan: it neither selects nor places the
      // pin.
      if (g.button !== 1) this.tap(step.effect.at, this.pressShift);
    } else {
      // A drag (or cancel) in the middle of a double click undoes it and restarts the cycle.
      this.selectionBeforeTap = null;
      this.lastTap = null;
    }
    if (isStoreGesture(g)) {
      // Cancelled: back to the project from before the gesture. Otherwise, the final operation
      // repeats the same operation with the final values (snap, absorption) and settles the
      // membership; only then records one entry.
      // A loose end outside a marking cancels, like Esc.
      if (cancelled || (g.kind === 'arrow-end' && !g.valid)) actions.cancelGesture();
      else {
        this.finishStoreGesture(g);
        actions.commitGesture();
      }
      this.clearTransient();
    }
    if (g.kind === 'draw') this.finishDraw(g, cancelled);
    if (g.kind === 'arrow-link') this.finishArrowLink(g, cancelled);
    if (g.kind === 'select-rect') {
      this.finishMarquee(
        g,
        this.o.viewport.toCanvas(this.o.viewport.screenPoint(e)),
        cancelled,
      );
    }
    if (e.pointerType === 'mouse') this.updateCursor(this.o.viewport.screenPoint(e));
  }

  /** The final operation of a store gesture, with everything the interaction adds on release. */
  private finishStoreGesture(g: StoreGesture): void {
    const { actions } = this.o;
    switch (g.kind) {
      case 'move-image':
      case 'resize-image':
        actions.finishImagePlacement(g.containerId);
        return;
      case 'move-items':
        // No snap and no absorption: each item moves by the same displacement as the last valid
        // preview, and membership is settled once over the whole result.
        actions.finishItemsMove(g.items, g.dx, g.dy);
        return;
      case 'move-marking': {
        // Snap: nearly entirely in a container, the marking is carried into it.
        const { snap } = this.moveSnap(g);
        actions.finishMarkingMove(
          g.markingId,
          g.dx + (snap?.dx ?? 0),
          g.dy + (snap?.dy ?? 0),
        );
        return;
      }
      case 'arrow-route':
      case 'arrow-end':
        // The preview is already the result: the point or end stays where the pointer was released.
        return;
      case 'resize-marking': {
        // Absorption: the rectangle grows until it wraps what crosses within the tolerance.
        const marking = this.markingNow(g.markingId);
        if (!marking) return;
        // Ended where it began (the handle did not change anything): it is not a resize.
        if (sameRect(marking.rect, g.startRect)) {
          actions.finishMarkingRect(g.markingId, g.startRect);
          return;
        }
        const tolerance = spaceTolerance(this.o.viewport.scale, g.placement.scale);
        const { rect } = absorbInto(
          marking.rect,
          g.candidates,
          tolerance,
          g.limits.outer,
        );
        actions.finishMarkingRect(g.markingId, rect);
        return;
      }
    }
  }

  /** Released the link handle: over a marking, creates the arrow (one entry) and selects it. */
  private finishArrowLink(
    g: Extract<Gesture, { kind: 'arrow-link' }>,
    cancelled: boolean,
  ): void {
    const target = this.o.state.arrowDraft.peek()?.target ?? null;
    this.clearTransient();
    if (cancelled || target === null) return;
    const result = this.o.actions.addArrow(g.markingId, target);
    if (result.ok) this.o.ui.selection.value = { kind: 'arrow', id: result.value };
  }

  private finishDraw(g: Extract<Gesture, { kind: 'draw' }>, cancelled: boolean): void {
    const { draft } = this.o.state;
    const drawn = draft.peek();
    this.clearTransient();
    if (cancelled || !drawn) return;
    if (!isDrawableRect(drawn.rect)) {
      // A real drag (past the threshold) released below the minimum: warns instead of silently
      // discarding.
      showToast(this.o.ui, t('marking.error.rect-too-small', { min: MIN_MARKING_SIZE }));
      return;
    }
    const tolerance = spaceTolerance(
      this.o.viewport.scale,
      g.image?.placement.scale ?? 1,
    );
    const { rect } = absorbInto(
      drawn.rect,
      g.candidates,
      tolerance,
      g.image ? imagePixelRect(g.image) : null,
    );
    const result = this.o.actions.createMarking(drawn.containerId, rect);
    if (result.ok) this.o.ui.selection.value = { kind: 'marking', id: result.value };
  }

  /** The thread pin under `p` (screen). */
  private pinUnder(p: Point): PinPlace | null {
    return this.o.pinAt?.(this.o.viewport.toCanvas(p)) ?? null;
  }

  /** The cursor and hint of the pins and of the armed Comment; `null` if none applies to `p`. */
  private commentCursor(p: Point | null): string | null {
    if (this.o.ui.commentArm.peek() !== null) return 'crosshair';
    const pin = p && this.pinUnder(p);
    this.o.container.title = pin ? pinTitle(this.o.derived, pin) : '';
    return pin ? 'pointer' : null;
  }

  /** The click at `c` (canvas) on the armed Comment or on a pin; `true` if it consumed it. */
  private tapComment(c: Point): boolean {
    const { store } = this.o;
    const project = this.project();
    const consumed = tapComment(
      {
        ui: this.o.ui,
        derived: this.o.derived,
        project,
        blocked: store.readOnly.peek() || (this.o.reviewing?.() ?? false),
        visibility: this.o.derived.markingVisibility.peek(),
        arrows: this.arrowHit(project),
        titles: this.o.containerTitles?.(),
        pin: this.o.pinAt?.(c) ?? null,
      },
      c,
    );
    if (consumed) this.lastTap = null;
    return consumed;
  }

  /**
   * Selects by the click at `p` (screen); clicking again on the same point goes up to the parent.
   * With the multi-select modifier (`shift`: Shift, Ctrl or Cmd), toggles the first item under
   * the point in the selection (without the go-to-parent cycle); in the void, Shift changes
   * nothing. In review, Shift+click is a simple click.
   */
  private tap(p: Point, shift: boolean): void {
    const { ui, derived, viewport } = this.o;
    const c = viewport.toCanvas(p);
    this.selectionBeforeTap = ui.selection.peek();
    if (this.tapComment(c)) return;
    // A click on a handle (link or of the selected arrow) does not change the selection: the
    // double click on a waypoint removes it, and the first click must not take the arrow out of
    // the selection. With Shift the click belongs to multi-select, even over a handle.
    const onHandle = this.intentAt(p).kind;
    if (!shift && (onHandle === 'arrow-link' || onHandle === 'arrow-handle')) {
      this.lastTap = null;
      return;
    }
    if (shift && !(this.o.reviewing?.() ?? false)) {
      this.lastTap = null; // A later simple click does not continue the cycle.
      const project = this.project();
      const first =
        project &&
        hitChain(
          project,
          derived.markingVisibility.peek(),
          c,
          this.arrowHit(project),
          this.o.containerTitles?.(),
        )[0];
      if (first) toggleSelectedItem(ui, first);
      return;
    }
    const repeat = isRepeatTap(this.lastTap, c, viewport.scale);
    this.lastTap = c;
    ui.selection.value = tapSelection(
      this.project(),
      ui.selection.peek(),
      derived.markingVisibility.peek(),
      c,
      repeat,
      this.arrowHit(this.project()),
      this.o.containerTitles?.(),
    );
  }

  /**
   * Double click (Navigate, mouse): selects the marking with its content (the markings that
   * cover it and, for a canvas marking, the member containers with their markings), with the
   * marking as primary. On a container, it only returns the selection to it (the second touch of
   * the double click had already gone up one step in the chain). The next click restarts the cycle.
   */
  private onDoubleClick(e: MouseEvent): void {
    const { ui } = this.o;
    this.lastTap = null;
    const project = this.project();
    const target = this.selectionBeforeTap;
    if (isMultiSelectClick(e) || this.lastPointerType === 'touch' || !project || !target)
      return;
    if (this.o.reviewing?.()) return;
    if (!ui.viewMode.peek() && ui.mode.peek() !== 'navigate') return;
    const index = projectIndex(project);
    if (target.kind === 'arrow') {
      // The arrow's route (waypoints) belongs to Main only.
      if (!this.o.perspectiveOpen?.()) this.removeWaypointAt(e, project, target.id);
      return;
    }
    if (target.kind === 'marking') {
      if (index.markings.has(target.id)) {
        selectItems(ui, selectionWithContents(project, target.id));
      }
    } else if (index.containers.has(target.id)) {
      ui.selection.value = { kind: 'image', id: target.id };
    }
  }

  /**
   * Double click on a waypoint of the arrow `arrowId`: removes the point (one entry) and leaves
   * the arrow selected (the second touch may have swapped it). On a middle segment of an
   * `elbow` arrow, goes back to the default route (empty `points`). Outside a point or segment,
   * or with the arrow locked or the project read-only, does nothing.
   */
  private removeWaypointAt(e: MouseEvent, project: Project, arrowId: string): void {
    const { viewport, actions, store, ui } = this.o;
    const arrow = projectIndex(project).arrows.get(arrowId);
    const shape = arrow && arrowShape(project, arrow);
    if (!arrow || !shape || store.readOnly.peek() || !canEditArrow(project, arrowId))
      return;
    const handle = arrowHandleAt(
      shape,
      viewport.toCanvas(viewport.screenPoint(e)),
      viewport.scale,
    );
    if (handle?.kind !== 'point' && handle?.kind !== 'segment') return;
    const result = actions.setArrowRoute(
      arrowId,
      handle.kind === 'segment' ? [] : arrow.points.filter((_, i) => i !== handle.index),
    );
    if (result.ok) ui.selection.value = { kind: 'arrow', id: arrowId };
  }

  /**
   * Right mouse button: selects the item under the cursor (the innermost marking, or the
   * image) and opens its context menu. An item already in the multi-selection is not
   * undone: the menu opens for it and the selection stays. On a touch screen, a long touch also
   * fires `contextmenu`; it does not open the menu (the actions stay in the Tree and in Details).
   */
  private openContextMenu(e: MouseEvent): void {
    const { ui, derived, viewport } = this.o;
    ui.canvasMenu.value = null;
    if (!this.canOpenContextMenu()) return;
    const picked = tapSelection(
      this.project(),
      ui.selection.peek(),
      derived.markingVisibility.peek(),
      viewport.toCanvas(viewport.screenPoint(e)),
      false,
      this.arrowHit(this.project()),
      this.o.containerTitles?.(),
    );
    if (picked && !isItemSelected(peekSelectedItems(ui), picked)) {
      ui.selection.value = picked;
    }
    const c = viewport.toCanvas(viewport.screenPoint(e));
    const menu = canvasMenuAt(this.project(), picked, c, { x: e.clientX, y: e.clientY });
    if (menu) ui.canvasMenu.value = menu;
  }

  /** Long touch, gesture in progress and review (read-only) do not open the menu. */
  private canOpenContextMenu(): boolean {
    if (this.lastPointerType === 'touch') return false;
    // Ctrl+click (macOS) arrives as `pointerdown` and `contextmenu`: the still-pending gesture is
    // cancelled, so the next `pointerup` does not become a click. A drag in progress continues.
    if (this.gesture?.kind === 'pending') this.dropPendingGesture();
    return this.gesture === null && !(this.o.reviewing?.() ?? false);
  }

  /** Discards the pending gesture (nothing started): the pointer's `pointerup` is ignored. */
  private dropPendingGesture(): void {
    const g = this.gesture;
    if (g?.kind !== 'pending') return;
    this.pointers.delete(g.pointerId);
    this.gesture = null;
    this.gestureState = IDLE;
  }

  private onWheel(e: WheelEvent): void {
    e.preventDefault();
    const factor = wheelZoomFactor(e.deltaY, e.deltaMode, e.ctrlKey);
    this.o.viewport.zoomAt(this.o.viewport.screenPoint(e), factor);
  }
}
