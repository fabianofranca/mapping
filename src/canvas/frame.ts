// Inputs of a canvas frame and the interaction state that the pointer input writes
// and the renderers read. No Konva: only types and pure functions.
import { signal, type Signal } from '@preact/signals';
import type {
  ComponentDrawings,
  MarkingVisibility,
  Placement,
  Project,
  Rect,
} from '../model';
import type { DisplayImage } from '../store/displayImages';
import type { Locale } from '../store/settings';
import type { EditorMode, Selection, SelectionItem } from '../store/ui';
import type { ArrowShape } from './arrowGeometry';
import type { ArrivalMarks } from './arrivals';
import type { PinPlace } from './commentPins';
import type { ReviewCanvas } from './reviewMarks';
import type { CanvasTokens } from './theme';
import type { Point, Size, Viewport } from './viewport';

/** Position shown during an image gesture (follows the finger, even if invalid). */
export interface ImagePreview {
  readonly containerId: string;
  readonly placement: Placement;
  readonly valid: boolean;
}

/** Target of a file drag-and-drop: empty area or an image (it will be replaced). */
export type DropTarget = {
  readonly containerId: string | null;
  /** Marking (component with a slot) that would receive the item: its rectangle lights up. */
  readonly markingId?: string;
} | null;

/** Locked item under the mouse: gets the padlock badge while the cursor is on it. */
export interface HoverLock {
  readonly kind: 'image' | 'marking';
  readonly id: string;
}

/**
 * Rectangle being drawn (Draw mode): in container pixels, or in canvas units
 * (`containerId` null) when the drawing started in the empty space.
 */
export interface Draft {
  readonly containerId: string | null;
  readonly rect: Rect;
}

/**
 * Arrow gesture in progress (ME4): the provisional line (create from the link handle, or drag an
 * end that is not yet over a marking, in canvas units) and the marking that would receive the
 * end if the pointer were released now (lights up like the drop target).
 */
export interface ArrowDraft {
  readonly line: { readonly from: Point; readonly to: Point } | null;
  readonly target: string | null;
}

/** Transient gesture state: written by the input, drawn in the overlays. */
export interface InteractionState {
  readonly preview: Signal<ImagePreview | null>;
  readonly draft: Signal<Draft | null>;
  /** Marking (or image) with locked geometry under the mouse; `null` if there is none or it is free. */
  readonly hoverLock: Signal<HoverLock | null>;
  /**
   * Drawn marking (with a visible component) under the mouse, so the border shows; `null` if the
   * mouse is outside them. Only written when it changes and only while there are drawn markings.
   */
  readonly hoverMarking: Signal<string | null>;
  /**
   * Container that would keep the dragged marking if it were dropped now (it contains it or receives
   * it by snapping), when it is a different one than the origin: lights up like the file drop target.
   */
  readonly moveTarget: Signal<string | null>;
  /**
   * Items that would be absorbed if the drawing or the resize ended now (they light up),
   * in canvas units. Written only when it changes.
   */
  readonly absorb: Signal<readonly Rect[]>;
  /** Arrow gesture in progress (creating or swapping an end); `null` outside it. */
  readonly arrowDraft: Signal<ArrowDraft | null>;
  /** Rectangle of the Shift+drag selection (canvas); `null` outside the gesture. */
  readonly marquee: Signal<Rect | null>;
}

/** Empty interaction signals (the canvas and the tests build the state from here). */
export function createInteractionState(): InteractionState {
  return {
    preview: signal<ImagePreview | null>(null),
    draft: signal<Draft | null>(null),
    hoverLock: signal<HoverLock | null>(null),
    hoverMarking: signal<string | null>(null),
    moveTarget: signal<string | null>(null),
    absorb: signal<readonly Rect[]>([]),
    arrowDraft: signal<ArrowDraft | null>(null),
    marquee: signal<Rect | null>(null),
  };
}

/**
 * What view mode shows of the canvas (`ViewShow` without the layers with drawing, which already
 * arrive filtered in `drawn`). `null` in the frame outside the mode.
 */
export interface ViewFrame {
  readonly containers: boolean;
  readonly images: boolean;
  readonly outline: boolean;
  readonly names: boolean;
  readonly arrows: boolean;
}

/** Everything a frame draws. Changing any item schedules a new frame. */
export interface Frame {
  readonly project: Project | null;
  readonly readOnly: boolean;
  readonly bitmaps: ReadonlyMap<string, DisplayImage<ImageBitmap>>;
  readonly preview: ImagePreview | null;
  readonly draft: Draft | null;
  readonly dropTarget: DropTarget;
  /** Items that the drawing or resize in progress would absorb (canvas). */
  readonly absorb: readonly Rect[];
  readonly hoverLock: HoverLock | null;
  /** Drawn marking under the mouse (its border shows); `null` if none. */
  readonly hoverMarking: string | null;
  readonly tokens: CanvasTokens;
  readonly size: Size;
  readonly viewport: Viewport;
  readonly selection: Selection;
  /**
   * All the selected items (multiple selection), the primary (`selection`) last; empty in view
   * mode, like the selection. The handles, the padlock and the name label belong only to the primary;
   * the others get the secondary selection outline (`overlay.ts`). Same object while the
   * selection does not change: the frame compares by reference.
   */
  readonly items: readonly SelectionItem[];
  readonly mode: EditorMode;
  readonly locale: Locale;
  readonly incomplete: ReadonlySet<string>;
  readonly visibility: ReadonlyMap<string, MarkingVisibility>;
  /**
   * Drawings of the components of the drawn project (with the gesture preview), per marking. The
   * canvas compares the objects by identity: only what changed is redone.
   */
  readonly drawings: ComponentDrawings;
  /** Markings whose drawing is visible (they have a border only on hover and selection, and no text card). */
  readonly drawn: ReadonlySet<string>;
  /** Floating markings of the project in view: their drawing stays above everything. */
  readonly floating: ReadonlySet<string>;
  /** Review marks of a proposal (stage 4); `null` outside the review. */
  readonly review: ReviewCanvas | null;
  /**
   * Drawn arrows (v13): those of the drawn project with both ends visible; empty with
   * "Show arrows" off (outside view mode, which has the Arrows item). The same array while they do not change.
   */
  readonly arrows: readonly ArrowShape[];
  /** Arrow gesture in progress (provisional line and target marking). */
  readonly arrowDraft: ArrowDraft | null;
  /** Rectangle of the Shift+drag selection (canvas); `null` outside the gesture. */
  readonly marquee: Rect | null;
  /**
   * View mode: what the canvas shows (`ViewFrame`); `null` outside the mode. In the mode there is no
   * selection, handles, hover, indicators, draft or review marks, and `visibility` carries all
   * the markings whole (whoever hides the outline or the name is this item). The same object
   * while the five items do not change.
   */
  readonly view: ViewFrame | null;
  /**
   * Thread pins (decision 24): empty with the pins off (except the selected thread's),
   * in view mode and in review. The same array while the project, the threads and the
   * visibility do not change: pan and zoom do not recompute it.
   */
  readonly pins: readonly PinPlace[];
  /** The selected thread: its pin gets the selected ring. */
  readonly pinSelected: string | null;
  /** Where the dashed pin of a new-thread draft at a point sits (canvas); `null` outside it. */
  readonly draftPin: Point | null;
  /**
   * Arrival marks (PE3, decision 8): the "Came from <name>" stamp and the "Arrival area" band, only on the
   * Main one; `null` with a perspective or an open proposal, in view mode or without a mark.
   * The same object while the project does not change: pan and zoom do not recompute it.
   */
  readonly arrivals?: ArrivalMarks | null;
}

/** `true` if `a` and `b` have the same values (by reference) on the given keys. */
export function sameFrame(
  a: Frame | null,
  b: Frame,
  keys: readonly (keyof Frame)[],
): boolean {
  return a !== null && keys.every((key) => a[key] === b[key]);
}

/** What changes the drawing of the images (the viewport offset does not change it). */
export const IMAGE_KEYS = [
  'project',
  'bitmaps',
  'preview',
  'tokens',
  'locale',
  'view',
] as const;
/** What changes the components layer (the images' positions too, compared separately). */
export const COMPONENT_KEYS = ['drawings', 'drawn', 'floating', 'tokens'] as const;
/** What changes the arrows layer (the zoom, which changes the thickness, is compared separately). */
export const ARROW_KEYS = [
  'arrows',
  'tokens',
  'project',
  'selection',
  'items',
  'hoverMarking',
  'review',
  'view',
] as const;
/** What changes the overlays (selection, handles, draft, drop target). */
export const OVERLAY_KEYS = [
  'project',
  'readOnly',
  'preview',
  'draft',
  'dropTarget',
  'absorb',
  'hoverLock',
  // The anchor's link shows on the anchored one under the mouse (`overlay.ts`).
  'hoverMarking',
  'tokens',
  'selection',
  'items',
  'mode',
  'arrows',
  'arrowDraft',
  'marquee',
  // The selected one's name label carries the strike-through of the proposed removal (`overlay.ts`).
  'review',
] as const;

/** Part of the canvas visible on screen, in canvas coordinates. */
export function visibleArea(size: Size, vp: Viewport): Rect {
  return {
    x: -vp.x / vp.scale,
    y: -vp.y / vp.scale,
    width: size.width / vp.scale,
    height: size.height / vp.scale,
  };
}

export const requestFrame: (callback: () => void) => number =
  typeof requestAnimationFrame === 'function'
    ? (callback) => requestAnimationFrame(callback)
    : (callback) => window.setTimeout(callback, 16);
export const cancelFrame: (id: number) => void =
  typeof cancelAnimationFrame === 'function'
    ? (id) => cancelAnimationFrame(id)
    : (id) => window.clearTimeout(id);
