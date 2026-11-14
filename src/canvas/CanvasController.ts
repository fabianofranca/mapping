// Imperative canvas with Konva. Orchestrates: builds the frame from the project, UI and
// derived-state signals, schedules one render per frame and delegates the drawing to the
// renderers, the input to `input/` and the viewport to the `ViewportController`. The only
// place (with `CanvasHost`) that knows Konva.
import { computed, effect, signal, untracked } from '@preact/signals';
import Konva from 'konva/lib/Core';
import {
  canEditImagePlacement,
  imageCanvasRect,
  isMarkingGeometryLocked,
  type Placement,
  type Project,
  type ProjectContainer,
} from '../model';
import type { EditorDerived } from '../store/derived';
import type { DisplayImages } from '../store/displayImages';
import type { ProjectStore } from '../store/history';
import type { ProjectActions } from '../store/project';
import type { ReviewState } from '../store/review';
import { locale, showArrows } from '../store/settings';
import type { PerspectiveState } from '../store/perspectives';
import { projectInPerspective } from '../store/perspectiveShown';
import { textMeasurer } from '../store/textMeasure';
import { selectionCanvasBounds } from './selectionBounds';
import { formatSelectionBox, formatViewport, selectionScreenBox } from './selectionBox';
import {
  formatArrowHandles,
  formatContainerBoxes,
  formatSelection,
} from './hostAttributes';
import { composingAnchor, selectedThreadId } from '../store/threadUi';
import {
  itemsOf,
  peekSelectedItems,
  resolveSelection,
  type EditorUi,
  type SelectionItem,
} from '../store/ui';
import {
  ARROW_KEYS,
  COMPONENT_KEYS,
  IMAGE_KEYS,
  OVERLAY_KEYS,
  cancelFrame,
  createInteractionState,
  requestFrame,
  sameFrame,
  visibleArea,
  type DropTarget,
  type Frame,
  type HoverLock,
  type InteractionState,
  type ViewFrame,
} from './frame';
import { arrowShape, visibleArrowShapes, type ArrowShape } from './arrowGeometry';
import { EMPTY_DRAG, dragSetOf, mergeDrag, type DragSet } from './dragSet';
import { ComponentLayerRenderer } from './components/componentLayer';
import { konvaMeasurer } from './components/konvaMeasurer';
import {
  type RemoteImageSource,
  sharedRemoteImageSource,
} from './components/remoteImages';
import { imageAt, imagesBounds } from './imageGeometry';
import { watchSpaceKey } from './input/keyboard';
import { PointerInput } from './input/pointer';
import { hitChain } from './input/intents';
import { canvasToImagePixel, markingCanvasRect } from './markingGeometry';
import { ArrowRenderer, type ArrowChanges } from './renderers/arrows';
import { ImageRenderer } from './renderers/images';
import { MarkingRenderer } from './renderers/markings';
import { OverlayRenderer } from './renderers/overlay';
import { CommentPinRenderer } from './renderers/commentPins';
import { ArrivalRenderer } from './renderers/arrivals';
import { arrivalMarks } from './arrivals';
import { ReviewRenderer } from './renderers/review';
import { pinHit, pinPlaces, pointCanvas, type PinPlace } from './commentPins';
import { proposedDisplay, reviewMarks, type ReviewCanvas } from './reviewMarks';
import { readCanvasTokens, watchTheme, type CanvasTokens } from './theme';
import { clampZoom, type Point, type Viewport } from './viewport';
import { ViewportController } from './viewportController';
import { sameCursor, type CanvasViewState } from './viewState';

export type { DropTarget } from './frame';

/** Same images with the same positions (by reference): zoom and pan do not change this. */
/** Writes or deletes (null value) a `data-*` on the host. */
function setDataAttr(host: HTMLElement, key: string, value: string | null): void {
  if (value === null) delete host.dataset[key];
  else host.dataset[key] = value;
}

function samePlacements(
  a: ReadonlyMap<string, Placement>,
  b: ReadonlyMap<string, Placement>,
): boolean {
  if (a.size !== b.size) return false;
  for (const [id, placement] of a) if (b.get(id) !== placement) return false;
  return true;
}

export interface CanvasControllerOptions {
  readonly container: HTMLDivElement;
  readonly store: ProjectStore;
  readonly actions: ProjectActions;
  readonly display: DisplayImages<ImageBitmap>;
  readonly ui: EditorUi;
  readonly derived: EditorDerived;
  /** Signals that the interface reads (zoom, cursor, minimap). */
  readonly view: CanvasViewState;
  /**
   * Proposal review (stage 4): with an open proposal, the canvas draws the "how it would look"
   * project (or the current one, in the Current view) with the review marks.
   */
  readonly review?: ReviewState;
  /**
   * Open perspective (stage #659, PE2): the canvas draws its project in view (the roots it
   * shows, where it places them) and does not start what is only for the Main one. Without it, the Main one.
   */
  readonly perspective?: PerspectiveState;
  /**
   * Remote images of the components (RI3): the app's two gates and the loader. Default: the production
   * source; tests pass a fake one.
   */
  readonly remoteImages?: RemoteImageSource;
}

/** No arrows in view ("Show arrows" off, or the Arrows item of view mode): always the same array. */
const NO_ARROWS: readonly ArrowShape[] = [];

/** Empty selection (view mode): always the same object, the frame compares by reference. */
const NO_ITEMS: readonly SelectionItem[] = [];

/**
 * Interaction state on top of the image (draft, lock, hover, selection, review marks,
 * arrow and selection rectangle). In view mode none of it appears.
 */
interface Overlays {
  readonly draft: Frame['draft'];
  readonly hoverLock: Frame['hoverLock'];
  readonly hoverMarking: Frame['hoverMarking'];
  readonly selection: Frame['selection'];
  readonly review: Frame['review'];
  readonly arrowDraft: Frame['arrowDraft'];
  readonly marquee: Frame['marquee'];
  readonly pins: Frame['pins'];
  readonly pinSelected: Frame['pinSelected'];
  readonly draftPin: Frame['draftPin'];
  readonly arrivals: Frame['arrivals'];
}
const NO_PINS: readonly PinPlace[] = [];
const NO_OVERLAYS: Overlays = {
  draft: null,
  hoverLock: null,
  hoverMarking: null,
  selection: null,
  review: null,
  arrowDraft: null,
  marquee: null,
  pins: NO_PINS,
  pinSelected: null,
  draftPin: null,
  arrivals: null,
};

/** What moves the markings' name label (the selected one's label shifts away from the parent's). */
const LABEL_KEYS = ['visibility', 'incomplete', 'view'] as const;
/** What changes the review marks, the pins and the arrival marks (besides the viewport and the screen). */
const REVIEW_KEYS = ['review', 'project', 'tokens', 'locale'] as const;
const PIN_KEYS = ['pins', 'pinSelected', 'draftPin', 'tokens', 'locale'] as const;
const ARRIVAL_KEYS = ['arrivals', 'tokens', 'locale'] as const;

/** Puts in `into` the containers' files (the background one, without a file, has no bitmap). */
function addFiles(
  into: Set<string>,
  containers: readonly { readonly file: string | null }[] | undefined,
): void {
  for (const image of containers ?? []) {
    if (image.file !== null) into.add(image.file);
  }
}

function sameSet(a: ReadonlySet<string>, b: ReadonlySet<string>): boolean {
  if (a.size !== b.size) return false;
  for (const value of a) if (!b.has(value)) return false;
  return true;
}

export class CanvasController {
  private readonly store: ProjectStore;
  private readonly display: DisplayImages<ImageBitmap>;
  private readonly ui: EditorUi;
  private readonly derived: EditorDerived;
  private readonly viewState: CanvasViewState;
  private readonly review: ReviewState | null;
  private readonly perspective: PerspectiveState | null;
  private readonly remoteImages: RemoteImageSource;
  /** URLs whose images changed since the last frame (the frame redoes only their markings). */
  private readonly changedImageUrls = new Set<string>();
  /** The consent or a switch changed: the frame redoes all markings with an image. */
  private allImagesChanged = false;
  /** Last mouse screen point, read in the frame (not on every `pointermove`). */
  private cursorPoint: Point | null = null;
  private cursorRequest: number | null = null;

  private readonly state: InteractionState = createInteractionState();
  private readonly dropTarget = signal<DropTarget>(null);
  private readonly tokens = signal<CanvasTokens>(readCanvasTokens());

  private readonly stage: Konva.Stage;
  private readonly view: ViewportController;
  private readonly pointer: PointerInput;
  private readonly images: ImageRenderer;
  /** Layer of the component drawings, between the images and the markings. */
  private readonly componentGroup: Konva.Layer;
  /** Stage layers by name: the frame redraws only the ones that changed (`dirty`). */
  private readonly layers: {
    readonly images: Konva.Layer;
    readonly components: Konva.Layer;
    readonly markings: Konva.Layer;
    readonly floating: Konva.Layer;
    readonly overlay: Konva.Layer;
  };
  /** Layers that some renderer touched in the current frame (reset when drawing). */
  private readonly dirty = new Set<Konva.Layer>();
  /**
   * Drag group (decisions 5 to 7): at the bottom of the overlays layer, carries the nodes of what
   * moves in a gesture, each stack in its own subgroup and in the usual drawing order. The stage
   * still has 5 layers.
   */
  private readonly dragRoot: Konva.Group;
  private readonly dragGroups: {
    readonly images: Konva.Group;
    readonly components: Konva.Group;
    readonly arrows: Konva.Group;
    readonly markings: Konva.Group;
    readonly floatingComponents: Konva.Group;
    readonly floating: Konva.Group;
  };
  /** What moves in the gesture in progress (only grows until release) and the drawn project from before it. */
  private drag: DragSet = EMPTY_DRAG;
  private dragBase: Project | null = null;
  private componentLayer: ComponentLayerRenderer;
  /**
   * Drawings of the floating markings (v13): layer above the markings, so they sit over
   * containers, components and borders. Their borders stay in the next group of the same layer.
   */
  private readonly floatingDrawings: Konva.Group;
  private floatingLayer: ComponentLayerRenderer;
  /** Colors `componentLayer` was created with: if the theme changed, it is redone. */
  private componentPalette: CanvasTokens['component'];
  private readonly markings: MarkingRenderer;
  /** Arrows group (in the markings layer), between the component drawings and the markings. */
  private readonly arrows: ArrowRenderer;
  private readonly overlay: OverlayRenderer;
  private readonly reviewLayer: ReviewRenderer;
  private readonly pinLayer: CommentPinRenderer;
  private readonly arrivalLayer: ArrivalRenderer;
  /** The minimap changed size: the arrival stamp is redone in the next frame. */
  private arrivalsStale = false;

  /**
   * Drawn project, derived from the project in view (`review.derived.shownProject`, phase
   * 8.2): when it is the confirmed one (outside the review or in the Current view), the store's, with the
   * gesture preview; when it is the "how it would look" (Proposed view), the preview with the new
   * or replaced images read from `proposals/<id>/` (`proposedDisplay`). The canvas does not decide
   * Current/Proposed: it only translates the images' file. It is also what touch, the cursor and
   * fit consult.
   */
  private readonly drawnProject = computed(() => {
    const review = this.review;
    // Outside the review: the store's project (with the gesture preview), cropped by the open
    // perspective. The preview changes `perspectives[].items`, so the crop comes from the store's project, not
    // from the confirmed one. In the review the perspective is the Main one (switching is locked).
    if (!review || review.proposalId.value === null) {
      return projectInPerspective(
        this.store.project.value,
        this.perspective?.id.value ?? null,
      );
    }
    const shown = review.derived.shownProject.value;
    if (shown === null || shown === this.store.committed.value) {
      return this.store.project.value;
    }
    const proposal = review.derived.proposal.value;
    return proposal ? proposedDisplay(shown, proposal) : shown;
  });

  /** Review marks (type, conflict, invalid, ghosts, removed); `null` outside it. */
  private readonly reviewCanvas = computed((): ReviewCanvas | null => {
    const review = this.review;
    if (!review || review.proposalId.value === null) return null;
    const d = review.derived;
    const proposal = d.proposal.value;
    const tree = d.tree.value;
    const current = this.store.committed.value;
    const drawn = this.drawnProject.value;
    if (!proposal || !tree || !current || !drawn) return null;
    return reviewMarks({
      proposal,
      tree,
      types: d.changeTypes.value,
      conflicts: d.conflictIds.value,
      invalid: d.invalid.value.changeIds,
      view: review.view.value,
      current,
      drawn,
    });
  });

  /**
   * Drawings of the drawn project's components: in a gesture preview only the dragged marking
   * is reinstantiated, and in the Proposed view they are the proposed values. The cache is the
   * derived one's (the other markings keep the same object).
   */
  private readonly drawings = computed(() =>
    this.derived.drawingsOf(this.drawnProject.value),
  );

  /**
   * Selected items (the primary last). A `computed` keeps the array until the selection changes:
   * redoing the frame because of pan or zoom must not redraw the overlay needlessly.
   */
  private readonly selectedItems = computed(() =>
    this.ui.viewMode.value
      ? NO_ITEMS
      : itemsOf(this.ui.selection.value, this.ui.selectionGroup.value),
  );

  /** Container that would receive the dragged marking, as a drop target. */
  private readonly moveTargetFrame = computed((): DropTarget => {
    const id = this.state.moveTarget.value;
    return id === null ? null : { containerId: id };
  });

  /** Marking that would receive the arrow's end (creating or swapping the end) as a drop target. */
  private readonly arrowTargetFrame = computed((): DropTarget => {
    const id = this.state.arrowDraft.value?.target ?? null;
    return id === null ? null : { containerId: null, markingId: id };
  });

  /**
   * What view mode shows, or `null` outside it. The same object while the five items
   * do not change: toggling a layer with drawing does not redo images, markings or arrows.
   */
  private lastView: ViewFrame | null = null;
  private readonly viewFrame = computed((): ViewFrame | null => {
    if (!this.ui.viewMode.value) return null;
    const { containers, images, outline, names, arrows } = this.ui.viewShow.value;
    const last = this.lastView;
    if (
      last?.containers === containers &&
      last.images === images &&
      last.outline === outline &&
      last.names === names &&
      last.arrows === arrows
    ) {
      return last;
    }
    this.lastView = { containers, images, outline, names, arrows };
    return this.lastView;
  });

  /**
   * Drawn arrows: those of the drawn project (with the gesture preview) whose two ends appear.
   * Outside view mode, only with "Show arrows" on; in the mode, only with the panel's Arrows item
   * (the Settings do not apply) and without the "Markings without annotation" filter. The routes are
   * kept per arrow and per project/visibility (`visibleArrowShapes`): pan and zoom do not
   * recompute them.
   */
  private readonly arrowShapes = computed((): readonly ArrowShape[] => {
    const view = this.viewFrame.value;
    if (!(view === null ? showArrows.value : view.arrows)) return NO_ARROWS;
    return visibleArrowShapes(
      this.drawnProject.value,
      this.derived.canvasVisibility.value,
    );
  });

  /**
   * The thread pins (decision 24): the derived state's groups placed on the drawn project.
   * None in the review (the thread is read-only, decision 26); the viewport does not enter here.
   */
  private readonly pinPlaces = computed((): readonly PinPlace[] => {
    if (this.review?.proposalId.value != null) return NO_PINS;
    const project = this.drawnProject.value;
    const groups = this.derived.threads.pins.value;
    if (!project || groups.length === 0) return NO_PINS;
    // A thread on a canvas point only appears on the Main one (decision 15).
    const principal = (this.perspective?.id.value ?? null) === null;
    return pinPlaces(project, groups, this.derived.canvasVisibility.value, principal);
  });

  /**
   * The arrival marks (PE3, decision 8): the "Came from <name>" stamp and the band, only on the Main one.
   * None with a perspective or an open proposal; memoized by the project (pan and zoom do not
   * enter here).
   */
  private readonly arrivalMarks = computed(() => {
    if (this.review?.proposalId.value != null) return null;
    if ((this.perspective?.id.value ?? null) !== null) return null;
    return arrivalMarks(this.drawnProject.value);
  });

  /** The dashed pin of the draft of a new thread at a point. */
  private readonly draftPin = computed((): Point | null => {
    const anchor = composingAnchor(this.ui);
    const project = this.drawnProject.value;
    if (anchor?.kind !== 'point' || !project || this.review?.proposalId.value != null) {
      return null;
    }
    return pointCanvas(project, anchor.containerId, anchor.x, anchor.y);
  });

  /** The frame's interaction state; empty in view mode (view only). */
  private readonly overlays = computed((): Overlays =>
    this.viewFrame.value !== null
      ? NO_OVERLAYS
      : {
          draft: this.state.draft.value,
          hoverLock: this.state.hoverLock.value,
          hoverMarking: this.state.hoverMarking.value,
          selection: this.ui.selection.value,
          review: this.reviewCanvas.value,
          arrowDraft: this.state.arrowDraft.value,
          marquee: this.state.marquee.value,
          pins: this.pinPlaces.value,
          pinSelected: selectedThreadId(this.ui),
          draftPin: this.draftPin.value,
          arrivals: this.arrivalMarks.value,
        },
  );

  /** Frame inputs: project, UI, derived data and viewport. */
  private readonly frame = computed((): Frame => {
    const view = this.viewFrame.value;
    const over = this.overlays.value;
    return {
      project: this.drawnProject.value,
      readOnly: this.store.locked.value,
      bitmaps: this.display.images.value,
      preview: this.state.preview.value,
      draft: over.draft,
      // The file drop target or, when dragging a marking, the container that would receive it.
      dropTarget:
        this.dropTarget.value ??
        this.moveTargetFrame.value ??
        this.arrowTargetFrame.value,
      absorb: this.state.absorb.value,
      hoverLock: over.hoverLock,
      hoverMarking: over.hoverMarking,
      tokens: this.tokens.value,
      size: this.view.size.value,
      viewport: this.view.viewport.value,
      selection: over.selection,
      items: this.selectedItems.value,
      mode: view === null ? this.ui.mode.value : 'navigate',
      locale: locale.value,
      incomplete: this.derived.incompleteMarkings.value,
      visibility: this.derived.canvasVisibility.value,
      drawings: this.drawings.value,
      drawn: this.derived.drawnMarkings.value,
      floating: this.derived.floatingMarkings.value,
      review: over.review,
      arrows: this.arrowShapes.value,
      arrowDraft: over.arrowDraft,
      marquee: over.marquee,
      view,
      pins: over.pins,
      pinSelected: over.pinSelected,
      draftPin: over.draftPin,
      arrivals: over.arrivals,
    };
  });
  /** Last drawn frame: what has not changed since it is not redrawn. */
  private drawn: Frame | null = null;
  /** Placements of the last frame (with the gesture preview applied). */
  private placements: ReadonlyMap<string, Placement> = new Map();
  private frameRequest: number | null = null;
  private destroyed = false;
  /** Images with a ready bitmap in the last frame and what has already been published on the container. */
  private readyImages = 0;
  private drawnComponents = 0;
  private drawnArrows = 0;
  private countedProject: Project | null = null;
  private canvasMarkingCount = 0;
  private published = '';
  /** `data-container-boxes`: stored text, the `containers` array it came from and the text version. */
  private boxesText: string | null = null;
  private boxesContainers: readonly ProjectContainer[] | null = null;
  private boxesVersion = 0;
  private readonly cleanups: (() => void)[] = [];

  constructor(options: CanvasControllerOptions) {
    const { container } = options;
    this.store = options.store;
    this.display = options.display;
    this.ui = options.ui;
    this.derived = options.derived;
    this.viewState = options.view;
    this.review = options.review ?? null;
    this.perspective = options.perspective ?? null;
    this.remoteImages = options.remoteImages ?? sharedRemoteImageSource();

    // The drawings measure text with Konva (the layout matches what is painted) and redraw themselves
    // when the measurer changes; the model and the store never import Konva.
    if (textMeasurer.peek() !== konvaMeasurer) textMeasurer.value = konvaMeasurer;

    this.stage = new Konva.Stage({ container, width: 1, height: 1 });
    // The layers' `name` only serves to identify them (test and perf:canvas meters).
    const imageLayer = new Konva.Layer({ listening: false, name: 'images' });
    this.componentGroup = new Konva.Layer({ listening: false, name: 'components' });
    // Arrows and markings share a layer (Konva warns in the console from six): they are
    // redrawn together on every edit, and a `Group` for each keeps the order (arrows underneath).
    const arrowMarkingLayer = new Konva.Layer({ listening: false, name: 'markings' });
    const arrowLayer = new Konva.Group({ listening: false });
    const markingLayer = new Konva.Group({ listening: false });
    arrowMarkingLayer.add(arrowLayer, markingLayer);
    const overlayLayer = new Konva.Layer({ listening: false, name: 'overlay' });
    const floatingTop = new Konva.Layer({ listening: false, name: 'floating' });
    this.stage.add(
      imageLayer,
      this.componentGroup,
      arrowMarkingLayer,
      floatingTop,
      overlayLayer,
    );
    this.layers = {
      images: imageLayer,
      components: this.componentGroup,
      markings: arrowMarkingLayer,
      floating: floatingTop,
      overlay: overlayLayer,
    };
    this.images = new ImageRenderer(imageLayer);
    this.componentPalette = this.tokens.peek().component;
    this.componentLayer = this.newComponentLayer(this.componentGroup);
    this.floatingDrawings = new Konva.Group({ listening: false });
    const floatingMarkings = new Konva.Group({ listening: false });
    floatingTop.add(this.floatingDrawings, floatingMarkings);
    this.floatingLayer = this.newComponentLayer(this.floatingDrawings);
    this.markings = new MarkingRenderer(markingLayer, floatingMarkings);
    this.arrows = new ArrowRenderer(arrowLayer);
    this.overlay = new OverlayRenderer(overlayLayer, container);
    // The review marks sit below the overlays (selection, handles).
    const reviewGroup = new Konva.Group({ listening: false });
    overlayLayer.add(reviewGroup);
    reviewGroup.moveToBottom();
    this.reviewLayer = new ReviewRenderer(reviewGroup);
    const pinGroup = new Konva.Group({ listening: false });
    overlayLayer.add(pinGroup);
    this.pinLayer = new CommentPinRenderer(pinGroup);
    // The arrival band and stamps sit below the overlays, above the review marks.
    const arrivalGroup = new Konva.Group({ listening: false });
    overlayLayer.add(arrivalGroup);
    arrivalGroup.moveToBottom();
    this.arrivalLayer = new ArrivalRenderer(arrivalGroup, () => {
      this.arrivalsStale = true;
      this.requestRender();
    });
    // The drag group sits below everything in the layer (arrival band, review marks,
    // pins and handles); on release, the nodes go back to the layers they came from.
    this.dragRoot = new Konva.Group({ listening: false, name: 'drag' });
    const dragGroup = () => {
      const group = new Konva.Group({ listening: false });
      this.dragRoot.add(group);
      return group;
    };
    this.dragGroups = {
      images: dragGroup(),
      components: dragGroup(),
      arrows: dragGroup(),
      markings: dragGroup(),
      floatingComponents: dragGroup(),
      floating: dragGroup(),
    };
    overlayLayer.add(this.dragRoot);
    this.dragRoot.moveToBottom();

    this.view = new ViewportController(container, () => this.drawnProject.peek());
    const space = watchSpaceKey(() => this.pointer.updateCursor(null));
    this.pointer = new PointerInput({
      container,
      store: this.store,
      actions: options.actions,
      ui: this.ui,
      derived: this.derived,
      viewport: this.view,
      state: this.state,
      spaceDown: space.down,
      project: () => this.drawnProject.peek(),
      reviewing: () => this.review?.proposalId.peek() != null,
      perspectiveOpen: () => this.perspective?.openId() != null,
      pinAt: (c) => {
        const { pins, tokens } = this.frame.peek();
        return pinHit(pins, c, this.view.scale, tokens.pin);
      },
      containerTitles: () => this.images.titleRects(),
    });

    this.cleanups.push(
      this.pointer.bind(),
      space.dispose,
      this.view.observe(),
      watchTheme(() => (this.tokens.value = readCanvasTokens())),
      effect(() => this.loadBitmaps()),
      // A remote image that finishes (or fails, or leaves the cache): redoes only its markings, in a
      // single frame (`requestRender` coalesces several in the same frame).
      this.remoteImages.subscribe((url) => {
        if (this.destroyed) return;
        this.changedImageUrls.add(url);
        this.requestRender();
      }),
      // Consent or a switch changed: all markings with a remote image are redone.
      effect(() => {
        void this.remoteImages.gate.value;
        this.allImagesChanged = true;
        this.requestRender();
      }),
      // The effect only schedules: several changes in the same frame produce a single drawing.
      effect(() => {
        void this.frame.value;
        this.requestRender();
      }),
      // Releasing without changing anything does not change the frame, but the drag group's nodes need to go back.
      effect(() => {
        void this.store.gestureActive.value;
        this.requestRender();
      }),
      // Mirrors the viewport to the interface (status bar, minimap, zoom field).
      effect(() => {
        this.viewState.viewport.value = this.view.viewport.value;
        this.viewState.size.value = this.view.size.value;
      }),
      effect(() => {
        // Project in view, without the gesture preview: a gesture in progress does not redo the
        // minimap on every frame; in the Proposed view, the preview's images.
        const shown =
          this.review?.derived.shownProject.value ??
          projectInPerspective(
            this.store.committed.value,
            this.perspective?.id.value ?? null,
          );
        this.viewState.bounds.value = imagesBounds(
          shown?.containers ?? [],
          shown?.markings,
        );
      }),
      this.watchCursor(),
      () => {
        if (this.frameRequest !== null) cancelFrame(this.frameRequest);
        this.frameRequest = null;
        if (this.cursorRequest !== null) cancelFrame(this.cursorRequest);
        this.cursorRequest = null;
      },
    );
  }

  /** Fits all the images (or a default area, with the empty canvas). */
  fitAll(): void {
    this.view.fitAll();
  }

  /**
   * Fits all the selected items (zoom and center), with `fitAll`'s margin. It only touches the
   * view: with no selection, or in View mode, it does nothing.
   */
  fitSelection(): void {
    if (this.ui.viewMode.peek()) return;
    const bounds = selectionCanvasBounds(
      this.drawnProject.peek(),
      peekSelectedItems(this.ui),
    );
    if (bounds) this.view.fitTo(bounds);
  }

  /** Applies zoom `factor` at the center of the visible area (zoom field and shortcuts). */
  zoomBy(factor: number): void {
    const size = this.view.size.peek();
    this.view.zoomAt({ x: size.width / 2, y: size.height / 2 }, factor);
  }

  /** Goes to an exact zoom (1 = 100%), keeping the center of the visible area. */
  zoomTo(scale: number): void {
    const current = this.view.scale;
    if (current > 0) this.zoomBy(clampZoom(scale) / current);
  }

  /** Centers the view on a canvas point (minimap click). */
  centerOnPoint(point: Point): void {
    this.view.centerOnPoint(point);
  }

  /** Centers the canvas on the selected item (adjusting the zoom if it is too large or too small). */
  centerSelection(): void {
    this.view.measure(); // The canvas may have just reappeared (List → Canvas tab).
    const project = this.drawnProject.peek();
    const selected = resolveSelection(project, this.ui.selection.peek());
    if (!project || !selected) return;
    if (selected.kind === 'arrow') {
      // The arrow is fitted by its stroke box (the curve included).
      const shape = arrowShape(project, selected.arrow);
      if (shape) this.view.centerOn(shape.bounds);
      return;
    }
    this.view.centerOn(
      selected.kind === 'marking'
        ? markingCanvasRect(selected.space.placement, selected.marking.rect)
        : imageCanvasRect(selected.image, selected.image.placement),
    );
  }

  /** If the selection is outside the visible area, does the minimal pan to it (without changing the zoom). */
  revealSelection(): void {
    this.view.measure();
    const project = this.drawnProject.peek();
    const selected = resolveSelection(project, this.ui.selection.peek());
    if (project && selected?.kind === 'arrow') {
      const shape = arrowShape(project, selected.arrow);
      if (shape) this.view.reveal(shape.bounds);
      return;
    }
    if (selected?.kind !== 'marking') return;
    this.view.reveal(markingCanvasRect(selected.space.placement, selected.marking.rect));
  }

  /** Canvas point (canvas units) under a page screen coordinate. */
  canvasPointAt(clientX: number, clientY: number): Point {
    return this.view.toCanvas(this.view.screenPoint({ clientX, clientY }));
  }

  /** Center of the visible area, in canvas units. */
  viewportCenter(): Point {
    return this.view.center();
  }

  /** Id of the image under a page screen coordinate, or `null` in an empty area. */
  imageIdAt(clientX: number, clientY: number): string | null {
    const images = this.drawnProject.peek()?.containers ?? [];
    return imageAt(images, this.canvasPointAt(clientX, clientY))?.id ?? null;
  }

  /** Highlights the target of a drag-and-drop (`null` removes the highlight). */
  setDropTarget(target: DropTarget): void {
    this.dropTarget.value = target;
  }

  /** A pointer gesture is in progress (the keyboard arrows wait). */
  isInteracting(): boolean {
    return this.pointer.isInteracting();
  }

  /** Cancels the move/resize/draw gesture in progress. `true` if there was one. */
  cancelInteraction(): boolean {
    return this.pointer.cancelInteraction();
  }

  destroy(): void {
    this.destroyed = true;
    this.pointer.destroy();
    for (const cleanup of this.cleanups.splice(0)) cleanup();
    this.componentLayer.destroy();
    this.floatingLayer.destroy();
    this.arrivalLayer.destroy();
    this.arrows.destroy();
    this.markings.destroy();
    this.stage.destroy();
  }

  private newComponentLayer(parent: Konva.Group | Konva.Layer): ComponentLayerRenderer {
    return new ComponentLayerRenderer(parent, {
      placeholder: this.componentPalette,
      // An embedded image finished loading: asks for a frame (the node is already updated).
      onImageLoaded: () => {
        if (!this.destroyed) this.requestRender();
      },
      remoteImage: (url) => this.remoteImages.resolve(url),
    });
  }

  /**
   * Mouse cursor in image pixels (B8): the event only stores the point and schedules a
   * frame, so moving the mouse does not write signals more than once per frame.
   */
  private watchCursor(): () => void {
    const container = this.stage.container();
    const onMove = (e: PointerEvent) => {
      if (e.pointerType !== 'mouse') return;
      this.cursorPoint = { x: e.clientX, y: e.clientY };
      this.requestCursor();
    };
    const onLeave = () => {
      this.cursorPoint = null;
      this.requestCursor();
    };
    container.addEventListener('pointermove', onMove);
    container.addEventListener('pointerleave', onLeave);
    return () => {
      container.removeEventListener('pointermove', onMove);
      container.removeEventListener('pointerleave', onLeave);
    };
  }

  private requestCursor(): void {
    if (this.cursorRequest !== null) return;
    this.cursorRequest = requestFrame(() => {
      this.cursorRequest = null;
      const point = this.cursorPoint;
      // The drawn project: in the Proposed view, the image that only exists in the proposal also
      // gives coordinates (phase 8.2, P1).
      const project = this.drawnProject.peek();
      const canvas = point && this.canvasPointAt(point.x, point.y);
      const image = canvas && imageAt(project?.containers ?? [], canvas);
      const pixel = image && canvasToImagePixel(image.placement, canvas);
      const next =
        image && pixel
          ? { containerId: image.id, x: Math.floor(pixel.x), y: Math.floor(pixel.y) }
          : null;
      if (!sameCursor(this.viewState.cursor.peek(), next)) {
        this.viewState.cursor.value = next;
      }
      this.updateHover(project, canvas);
    });
  }

  /**
   * Item under the mouse for the padlock and for the border of drawn markings: the first of the touch
   * chain (the floating one, the innermost marking, the container, the canvas markings). It only
   * writes the signals when the result changes, and nothing is computed without locked items or
   * drawn markings.
   */
  private updateHover(project: Project | null, canvas: Point | null): void {
    const locks = this.derived.hasLocks.peek();
    const drawn = this.derived.drawnMarkings.peek();
    let lock: HoverLock | null = null;
    let marking: string | null = null;
    if (project && canvas && (locks || drawn.size > 0)) {
      const top = hitChain(
        project,
        this.derived.markingVisibility.peek(),
        canvas,
        undefined,
        this.images.titleRects(),
      )[0];
      if (top?.kind === 'marking') {
        if (locks && isMarkingGeometryLocked(project, top.id)) {
          lock = { kind: 'marking', id: top.id };
        }
        if (drawn.has(top.id)) marking = top.id;
      } else if (top && locks && !canEditImagePlacement(project, top.id)) {
        lock = { kind: 'image', id: top.id };
      }
    }
    const current = this.state.hoverLock.peek();
    if (current?.id !== lock?.id || current?.kind !== lock?.kind) {
      this.state.hoverLock.value = lock;
    }
    if (this.state.hoverMarking.peek() !== marking)
      this.state.hoverMarking.value = marking;
  }

  /**
   * The files of the project's images and, in the review, of the new or replaced ones waiting in
   * `proposals/`. A container without a file (background) has no bitmap. Returns the same list while the
   * content is equal: a gesture step does not change the files and does not retrigger `loadBitmaps`.
   */
  private readonly bitmapFiles = computed((): ReadonlySet<string> => {
    const files = new Set<string>();
    addFiles(files, this.store.project.value?.containers);
    addFiles(files, this.drawnProject.value?.containers);
    if (this.lastBitmapFiles && sameSet(this.lastBitmapFiles, files)) {
      return this.lastBitmapFiles;
    }
    this.lastBitmapFiles = files;
    return files;
  });
  private lastBitmapFiles: ReadonlySet<string> | null = null;

  private loadBitmaps(): void {
    const files = this.bitmapFiles.value;
    untracked(() => {
      for (const file of files) this.display.ensure(file);
      // Files that left the project (deleted or replaced image) do not stay in memory.
      this.display.retain(files);
    });
  }

  private requestRender(): void {
    if (this.frameRequest !== null) return;
    this.frameRequest = requestFrame(() => {
      this.frameRequest = null;
      this.render(this.frame.peek());
    });
  }

  /**
   * Draws the frame. Pan and zoom only change the viewport: the images are redone only
   * when the scale changes (thicknesses and texts), and the markings reuse the derived
   * data and the cards; only the cut of the visible part is redone.
   *
   * Dirty layers: each renderer says whether it touched any node (or only runs when its frame
   * changed) and the frame redraws only the layers so marked (`dirty`), with `layer.batchDraw()`.
   * Pan, zoom and size changes dirty all of them (the transform belongs to the stage). Konva also
   * schedules the drawing of the layer of a node whose attribute changed; the explicit mark covers what it
   * does not see (the arrows' path, which comes from data and not from attributes).
   */
  private render(frame: Frame): void {
    const last = this.drawn;
    this.drawn = frame;
    const { size, viewport: v } = frame;
    const scaleChanged = last?.viewport.scale !== v.scale;
    // Taking nodes to or returning them from the drag group: all renderers go through the frame.
    const dragChanged = this.syncDrag(frame, last);

    this.stage.size({ width: Math.max(1, size.width), height: Math.max(1, size.height) });
    // Position and scale in a single call: Konva groups the transform attributes in one
    // cascade. Each separate attribute (`scale()` alone is two) clears the transform cache of
    // every node on the stage and fires `absoluteTransformChange` on them.
    this.stage.setAttrs({ x: v.x, y: v.y, scaleX: v.scale, scaleY: v.scale });

    // Pan, zoom and size touch the stage's transform: all layers redraw.
    const moved = last === null || last.viewport !== v || last.size !== size;
    this.refreshRemoteImages();

    let placementsChanged = last === null;
    if (scaleChanged || dragChanged || !sameFrame(last, frame, IMAGE_KEYS)) {
      const next = this.images.render(frame);
      this.mark(this.layers.images, this.images.changed);
      this.mark(this.layers.overlay, this.images.draggedChanged);
      placementsChanged ||= !samePlacements(this.placements, next);
      this.placements = next;
      this.readyImages =
        frame.project?.containers.filter(
          (i) => i.file === null || frame.bitmaps.get(i.file)?.status === 'ready',
        ).length ?? 0;
    }
    // The component drawings are only redone when they, the visible set, the image positions
    // or the theme change.
    if (placementsChanged || dragChanged || !sameFrame(last, frame, COMPONENT_KEYS)) {
      this.renderComponents(frame);
    } else if (moved) {
      // Pan and zoom: the drawing is born on demand (only on screen) and hides outside it.
      const area = visibleArea(size, v);
      this.mark(this.layers.components, this.componentLayer.reveal(area, v.scale));
      this.mark(this.layers.floating, this.floatingLayer.reveal(area, v.scale));
    }
    // The screen-pixel drawings (`screen`) only readjust scale and position with the zoom.
    if (scaleChanged) {
      this.mark(this.layers.components, this.componentLayer.setZoom(v.scale));
      this.mark(this.layers.floating, this.floatingLayer.setZoom(v.scale));
    }
    // The arrows are only redone with them, the theme or the zoom (thickness and tip are screen-based), and with
    // what decides each one's level of detail: the selection and the mouse. On pan, only the visible
    // area is checked (`reveal`), as in the component drawings.
    if (scaleChanged || dragChanged || !sameFrame(last, frame, ARROW_KEYS)) {
      this.updateArrows(this.arrows.render(frame, this.placements));
    } else if (moved || placementsChanged) {
      this.updateArrows(this.arrows.reveal(frame, this.placements));
    }
    const marked = this.markings.render(frame, this.placements);
    this.mark(this.layers.markings, marked.main);
    this.mark(this.layers.floating, marked.floating);
    this.mark(this.layers.overlay, marked.drag);
    // The component drawings that move also stay in the drag group.
    this.mark(this.layers.overlay, this.componentLayer.takeDragChanged());
    this.mark(this.layers.overlay, this.floatingLayer.takeDragChanged());
    if (this.drag !== EMPTY_DRAG && this.dragRoot.zIndex() !== 0) this.dragRoot.zIndex(0);
    this.renderOverlayMarks(frame, last, moved || placementsChanged);
    // The name label anchors to the visible part: follows pan and screen size;
    // and shifts away from the parent's label, which changes with the semantic zoom and the visible layers.
    const viewMoved =
      last?.viewport !== v || last?.size !== size || !sameFrame(last, frame, LABEL_KEYS);
    if (
      scaleChanged ||
      !sameFrame(last, frame, OVERLAY_KEYS) ||
      (viewMoved && this.overlay.followsView)
    ) {
      this.dirty.add(this.layers.overlay);
      this.overlay.render(frame, this.placements, this.markings.headers);
    }
    this.drawDirtyLayers(moved);
    this.refreshContainerBoxes(frame, placementsChanged);
    this.publishHostAttributes(frame, v);
  }

  /**
   * The text of `data-container-boxes` (drawn placements): only redone with another placement or
   * another `containers` array in the drawn project (a resized container changes the width without
   * changing the placement); pan and zoom do not go through here. Each new text bumps the version.
   */
  private refreshContainerBoxes(frame: Frame, placementsChanged: boolean): void {
    const containers = frame.project?.containers ?? null;
    if (!placementsChanged && containers === this.boxesContainers) return;
    this.boxesContainers = containers;
    const text = containers ? formatContainerBoxes(containers, this.placements) : null;
    if (text === this.boxesText) return;
    this.boxesText = text;
    this.boxesVersion += 1;
  }

  /** The text of `data-arrow-handles`: only with a drawn arrow as the primary selection. */
  private arrowHandlesText(frame: Frame): string | null {
    const selection = frame.selection;
    if (selection?.kind !== 'arrow') return null;
    const shape = frame.arrows.find((s) => s.arrow.id === selection.id);
    return shape ? formatArrowHandles(shape, frame.viewport) : null;
  }

  /**
   * The host's `data-*` attributes (read-only, so e2e tests wait for the frame instead of a fixed
   * time): framing, images with a bitmap, drawn counts, view, selection box,
   * `data-selection`, `data-arrow-handles` and `data-container-boxes`. The DOM is only touched
   * when the `drawn` key changes; `data-container-boxes` enters it only through the text's version.
   */
  private publishHostAttributes(frame: Frame, v: Viewport): void {
    const canvasMarkings = this.countCanvasMarkings(frame.project);
    const componentImages =
      this.componentLayer.imageCount + this.floatingLayer.imageCount;
    const pins = this.pinLayer.size;
    const pinStates = this.pinLayer.states.join(',');
    const viewportText = formatViewport(v);
    const boxText = formatSelectionBox(
      selectionScreenBox(frame.project, frame.selection, this.placements, v),
    );
    const selectionText = formatSelection(frame.project, frame.selection);
    const handlesText = this.arrowHandlesText(frame);
    const drawn = `${this.view.fits}:${this.readyImages}:${this.drawnComponents}:${canvasMarkings}:${this.drawnArrows}:${this.markings.shown}:${componentImages}:${pins}:${pinStates}:${viewportText}:${boxText ?? ''}:${selectionText ?? ''}:${handlesText ?? ''}:${this.boxesVersion}`;
    if (drawn === this.published) return;
    this.published = drawn;
    const host = this.stage.container();
    host.dataset.viewport = viewportText;
    setDataAttr(host, 'selectionBox', boxText);
    setDataAttr(host, 'selection', selectionText);
    setDataAttr(host, 'arrowHandles', handlesText);
    setDataAttr(host, 'containerBoxes', this.boxesText);
    host.dataset.fits = String(this.view.fits);
    host.dataset.images = String(this.readyImages);
    host.dataset.components = String(this.drawnComponents);
    host.dataset.canvasMarkings = String(canvasMarkings);
    host.dataset.arrows = String(this.drawnArrows);
    host.dataset.drawnMarkings = String(this.markings.shown);
    host.dataset.componentImages = String(componentImages);
    host.dataset.pins = String(pins);
    host.dataset.pinStates = pinStates;
  }

  /**
   * Gesture in progress: what the preview moves (compared with the drawn project from before the gesture) goes
   * to the drag group; on release or cancel, everything goes back. Returns `true` when the set
   * changed (took new nodes or returned all of them), so the frame goes through all the renderers.
   * Membership and the final position remain the model's: here we only decide where the node sits.
   */
  private syncDrag(frame: Frame, last: Frame | null): boolean {
    if (!this.store.gestureActive.peek()) {
      this.dragBase = null;
      if (this.drag === EMPTY_DRAG) return false;
      this.drag = EMPTY_DRAG;
      this.applyDrag(EMPTY_DRAG);
      return true;
    }
    this.dragBase ??= last?.project ?? frame.project;
    const found = dragSetOf(
      this.dragBase,
      frame.project,
      frame.preview?.containerId ?? null,
    );
    const next = mergeDrag(this.drag, found);
    if (next === this.drag) return false;
    this.drag = next;
    this.applyDrag(next);
    return true;
  }

  /** Tells each renderer which nodes stay in the drag group (the empty set returns everything). */
  private applyDrag(set: DragSet): void {
    const on = set !== EMPTY_DRAG;
    const groups = this.dragGroups;
    this.images.setDragged(on ? set.containers : null, groups.images);
    this.componentLayer.setDragged(on ? set.markings : null, groups.components);
    this.floatingLayer.setDragged(on ? set.markings : null, groups.floatingComponents);
    this.markings.setDragged(on ? set.markings : null, {
      main: groups.markings,
      floating: groups.floating,
    });
    this.arrows.setDragged(on ? set.arrows : null, groups.arrows);
  }

  /** Marks the layers the arrows touched and stores how many are painted (`data-arrows`). */
  private updateArrows(changes: ArrowChanges): void {
    this.mark(this.layers.markings, changes.main);
    this.mark(this.layers.overlay, changes.drag);
    this.drawnArrows = this.arrows.painted;
  }

  /** Dirties the layer if the renderer touched any of its nodes. */
  private mark(layer: Konva.Layer, changed: boolean): void {
    if (changed) this.dirty.add(layer);
  }

  /**
   * The review marks, the pins and the arrival marks (overlays layer): only redone
   * when their data, the screen or the image positions changed.
   */
  private renderOverlayMarks(frame: Frame, last: Frame | null, stale: boolean): void {
    const redo = (keys: readonly (keyof Frame)[]) =>
      stale || !sameFrame(last, frame, keys);
    if (redo(REVIEW_KEYS)) {
      this.reviewLayer.render(frame, this.placements);
      this.dirty.add(this.layers.overlay);
    }
    if (redo(PIN_KEYS)) {
      this.pinLayer.render(frame);
      this.dirty.add(this.layers.overlay);
    }
    if (redo(ARRIVAL_KEYS) || this.arrivalsStale) {
      this.arrivalsStale = false;
      this.arrivalLayer.render(frame);
      this.dirty.add(this.layers.overlay);
    }
  }

  /** Draws the frame: the whole stage if it moved, otherwise only the dirty layers. */
  private drawDirtyLayers(all: boolean): void {
    if (all) this.stage.batchDraw();
    else for (const layer of this.dirty) layer.batchDraw();
    this.dirty.clear();
  }

  /** Redoes the markings whose remote images changed since the last frame. */
  private refreshRemoteImages(): void {
    if (!this.allImagesChanged && this.changedImageUrls.size === 0) return;
    const urls = this.allImagesChanged ? null : new Set(this.changedImageUrls);
    this.allImagesChanged = false;
    this.changedImageUrls.clear();
    this.mark(this.layers.components, this.componentLayer.refreshImages(urls));
    this.mark(this.layers.floating, this.floatingLayer.refreshImages(urls));
  }

  /** How many canvas markings (without a container) the frame has; recounted only when the project changes. */
  private countCanvasMarkings(project: Project | null): number {
    if (this.countedProject !== project) {
      this.countedProject = project;
      this.canvasMarkingCount =
        project?.markings.filter((m) => m.containerId === null).length ?? 0;
    }
    return this.canvasMarkingCount;
  }

  /**
   * Draws the components of the markings in view (one node per marking; only the changed one is redone).
   * The floating ones go to the top layer, above the borders of the other markings.
   */
  private renderComponents(frame: Frame): void {
    if (frame.tokens.component !== this.componentPalette) {
      // The placeholder colors are fixed when the drawing is mounted: new theme, new drawings.
      this.componentLayer.destroy();
      this.floatingLayer.destroy();
      this.dirty.add(this.layers.components);
      this.dirty.add(this.layers.floating);
      this.componentPalette = frame.tokens.component;
      this.componentLayer = this.newComponentLayer(this.componentGroup);
      this.floatingLayer = this.newComponentLayer(this.floatingDrawings);
      this.applyDrag(this.drag);
    }
    const { drawn, floating } = frame;
    const zoom = frame.viewport.scale;
    const area = visibleArea(frame.size, frame.viewport);
    this.mark(
      this.layers.components,
      this.componentLayer.render(
        frame.drawings,
        (drawing) => drawn.has(drawing.markingId) && !floating.has(drawing.markingId),
        this.placements,
        zoom,
        area,
      ),
    );
    this.mark(
      this.layers.floating,
      this.floatingLayer.render(
        frame.drawings,
        (drawing) => drawn.has(drawing.markingId) && floating.has(drawing.markingId),
        this.placements,
        zoom,
        area,
      ),
    );
    this.drawnComponents = this.componentLayer.size + this.floatingLayer.size;
  }
}
