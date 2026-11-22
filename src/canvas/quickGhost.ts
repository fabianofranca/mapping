// The ghost of the quick review (stage #1932, QR2): what the canvas draws, translucent, for the
// markings an open proposal creates or changes. Pure function over the store's `QuickReviewView`:
// the review marks (line and badge), the drawings and the box of only those markings. The
// controller draws the result; nothing here touches Konva or the DOM.
import {
  IDENTITY_PLACEMENT,
  changeType,
  changeStatus,
  projectIndex,
  reviewTree,
  type ComponentDrawing,
  type ComponentDrawings,
  type Project,
  type Proposal,
  type Rect,
} from '../model';
import type { QuickReviewView } from '../store/quickReview';
import { markingCanvasRect } from './markingGeometry';
import { unionRect } from './minimap';
import { reviewMarks, type ReviewCanvas, type ReviewShape } from './reviewMarks';
import { sameRect } from './viewState';

export interface QuickGhost {
  readonly proposalId: string;
  /** Drawings of ONLY the created and changed markings (one without a drawing is absent). */
  readonly drawings: ComponentDrawings;
  /** The Proposed review marks of the created and changed markings only; no images, no removed. */
  readonly review: ReviewCanvas;
  /** Union (canvas units) of the ghost markings at their preview positions; `null` when none resolves. */
  readonly box: Rect | null;
  /** Number of ghost markings (created + changed). */
  readonly items: number;
}

const NO_IDS: ReadonlySet<string> = new Set();

function boxOf(view: QuickReviewView, ids: ReadonlySet<string>): Rect | null {
  const { markings, containers } = projectIndex(view.preview);
  let box: Rect | null = null;
  for (const id of ids) {
    const marking = markings.get(id);
    if (!marking) continue;
    const placement =
      marking.containerId === null
        ? IDENTITY_PLACEMENT
        : containers.get(marking.containerId)?.placement;
    if (!placement) continue;
    const rect = markingCanvasRect(placement, marking.rect);
    box = box ? unionRect(box, rect) : rect;
  }
  return box;
}

/** Changes that no longer match the project (the same rule as the review's conflicts). */
function conflictsOf(p: Proposal, committed: Project): ReadonlySet<string> {
  const stub: Proposal = { ...p, decisions: {} };
  return new Set(
    p.changes.filter((c) => changeStatus(stub, c, committed).conflict).map((c) => c.id),
  );
}

function reviewOf(
  view: QuickReviewView,
  committed: Project,
  ids: ReadonlySet<string>,
): ReviewCanvas {
  const p = view.proposal;
  const all = reviewMarks({
    proposal: p,
    tree: reviewTree(p, committed),
    types: new Map(p.changes.map((c) => [c.id, changeType(c)])),
    conflicts: conflictsOf(p, committed),
    invalid: NO_IDS,
    view: 'proposed',
    current: committed,
    drawn: view.preview,
  });
  const markings = new Map([...all.markings].filter(([id]) => ids.has(id)));
  const ghosts = all.ghosts.filter((g: ReviewShape) =>
    ids.has(g.key.split(':')[1] ?? ''),
  );
  return { view: 'proposed', markings, images: new Map(), ghosts, removed: [] };
}

interface Cached {
  readonly drawings: ComponentDrawings;
  readonly committed: Project;
  readonly result: QuickGhost;
}

const cache = new WeakMap<QuickReviewView, Cached>();

/**
 * The ghost of `view` over `committed`. `drawings` is the drawings of `view.preview` (the caller
 * hands them in). Memoized by the three objects; never mutates them.
 */
export function quickGhost(
  view: QuickReviewView,
  committed: Project,
  drawings: ComponentDrawings,
): QuickGhost {
  const hit = cache.get(view);
  if (hit && hit.drawings === drawings && hit.committed === committed) return hit.result;
  const ids: ReadonlySet<string> = new Set([...view.created, ...view.changed]);
  const result: QuickGhost = {
    proposalId: view.proposal.id,
    drawings: new Map([...drawings].filter(([id]) => ids.has(id))),
    review: reviewOf(view, committed, ids),
    box: boxOf(view, ids),
    items: ids.size,
  };
  cache.set(view, { drawings, committed, result });
  return result;
}

/**
 * The ghost box (canvas units) in CSS px relative to the canvas host: the box times the zoom plus
 * the viewport offset. The quick-review bar anchors to it (`CanvasViewState.quickReviewBox`).
 */
export function quickBoxCss(
  box: Rect | null,
  view: { readonly x: number; readonly y: number; readonly scale: number },
): Rect | null {
  if (box === null) return null;
  return {
    x: box.x * view.scale + view.x,
    y: box.y * view.scale + view.y,
    width: box.width * view.scale,
    height: box.height * view.scale,
  };
}

const sameBadges = (a: readonly string[], b: readonly string[]): boolean =>
  a.length === b.length && a.every((kind, i) => kind === b[i]);

function sameReview(a: ReviewCanvas, b: ReviewCanvas): boolean {
  if (a.markings.size !== b.markings.size || a.ghosts.length !== b.ghosts.length) {
    return false;
  }
  for (const [id, mark] of a.markings) {
    const other = b.markings.get(id);
    if (!other || other.line !== mark.line || other.dim !== mark.dim) return false;
    if (!sameBadges(mark.badges, other.badges)) return false;
  }
  return a.ghosts.every((g, i) => {
    const o = b.ghosts[i];
    return !!o && o.key === g.key && sameRect(o.rect, g.rect);
  });
}

const drawingTexts = new WeakMap<object, string>();

/** The drawing as text (memoized by object): the drawings of an edited project are new objects with the same content. */
function drawingText(drawing: ComponentDrawing): string {
  let text = drawingTexts.get(drawing);
  if (text === undefined) {
    try {
      text = JSON.stringify(drawing);
    } catch {
      text = '';
    }
    drawingTexts.set(drawing, text);
  }
  return text;
}

function sameDrawings(a: ComponentDrawings, b: ComponentDrawings): boolean {
  if (a === b) return true;
  if (a.size !== b.size) return false;
  for (const [id, drawing] of a) {
    const other = b.get(id);
    if (!other) return false;
    if (other === drawing) continue;
    const text = drawingText(drawing);
    if (text === '' || text !== drawingText(other)) return false;
  }
  return true;
}

/**
 * `true` when `a` and `b` draw the same ghost: an edit that does not touch the ghost rebuilds the
 * preview (new objects) but not what it looks like, and the canvas must not redo its cache.
 */
export function sameGhost(a: QuickGhost, b: QuickGhost): boolean {
  if (a === b) return true;
  return (
    a.proposalId === b.proposalId &&
    a.items === b.items &&
    sameRect(a.box, b.box) &&
    sameDrawings(a.drawings, b.drawings) &&
    sameReview(a.review, b.review)
  );
}
