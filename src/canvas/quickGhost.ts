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
  type ComponentDrawings,
  type Project,
  type Proposal,
  type Rect,
} from '../model';
import type { QuickReviewView } from '../store/quickReview';
import { markingCanvasRect } from './markingGeometry';
import { unionRect } from './minimap';
import { reviewMarks, type ReviewCanvas, type ReviewShape } from './reviewMarks';

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
