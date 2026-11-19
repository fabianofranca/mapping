import {
  isRecord,
  projectIndex,
  proposalIndex,
  type Change,
  type Proposal,
  type ReviewTarget,
} from '../../model';
import { revealItem, type RevealSession } from '../../store/reveal';
import type { ReviewState } from '../../store/review';
import type { Selection } from '../../store/ui';

// The canvas selection that corresponds to a review level: a single function for the Details
// panel (`ReviewPanel`) and for the sync with the canvas (`useReviewSync`).

/**
 * The review item on the canvas: the marking, or the arrow (v13; the ids share the space),
 * whether it is from the project in view (of any page) or created by the proposal.
 */
function itemSelection(
  review: Pick<ReviewState, 'derived'>,
  id: string,
): NonNullable<Selection> {
  // Every page: the item may be on a page that is not the open one (it opens when selected).
  const shown = review.derived.shownAcrossPages.peek();
  const isArrow =
    (shown !== null && projectIndex(shown).arrows.has(id)) ||
    review.derived.proposal
      .peek()
      ?.changes.some((c) => c.entity === 'arrow' && c.entityId === id) === true;
  return { kind: isArrow ? 'arrow' : 'marking', id };
}

function changeSelection(
  review: Pick<ReviewState, 'derived'>,
  id: string,
): Selection | undefined {
  const proposal = review.derived.proposal.peek();
  const c = proposal ? proposalIndex(proposal).changes.get(id) : undefined;
  if (c?.markingId) return itemSelection(review, c.markingId);
  if (c?.imageId) return { kind: 'image', id: c.imageId };
  return undefined;
}

/** Canvas selection that corresponds to a review level (`undefined`: no change). */
export function canvasSelectionOf(
  review: Pick<ReviewState, 'derived'>,
  target: ReviewTarget | null,
): Selection | undefined {
  if (!target?.id) return undefined;
  switch (target.level) {
    case 'item':
      return itemSelection(review, target.id);
    case 'image':
      return { kind: 'image', id: target.id };
    case 'change':
      return changeSelection(review, target.id);
    default:
      return undefined;
  }
}

/** The `pageId` a created or removed root, or a page change, carries in its values. */
function carriedPage(c: Change): string | undefined {
  for (const value of [c.to, c.from]) {
    if (isRecord(value) && typeof value.pageId === 'string') return value.pageId;
  }
  return undefined;
}

/** The container a created marking sits in (its creation change says it), or `undefined`. */
function createdIn(c: Change): string | undefined {
  return isRecord(c.to) && typeof c.to.containerId === 'string'
    ? c.to.containerId
    : undefined;
}

/**
 * The page a created item gets from the changes that create it: its own creation carries the
 * `pageId` of a root, and a marking inside a created container takes the container's (PG4-a).
 */
function createdPageOf(
  proposal: Proposal,
  itemId: string,
  depth = 0,
): string | undefined {
  if (depth > 4) return undefined;
  const creation = proposal.changes.find(
    (c) => c.kind === 'create' && c.entityId === itemId && c.field === null,
  );
  if (!creation) return undefined;
  const own = carriedPage(creation);
  if (own !== undefined) return own;
  const container = createdIn(creation);
  return container === undefined
    ? undefined
    : createdPageOf(proposal, container, depth + 1);
}

/**
 * The page where a review item is, in the view being shown (stage #883, PG4, decision 16): the Current
 * view has an item moved by a page change on its origin page, the Proposed view on its destination.
 * An item that only the proposal creates is not in the Current view: the `pageId` of its creation (or
 * of the container it is created in) answers, and so does the one the target change carries.
 * `undefined` when the item is on no page (a change of the page list, a new image on the first page
 * of a view that lacks it).
 */
export function reviewPageOf(
  review: Pick<ReviewState, 'derived'>,
  target: ReviewTarget | null,
  itemId: string,
): string | undefined {
  const shown = review.derived.shownAcrossPages.peek();
  const found = shown ? projectIndex(shown).pageOf.get(itemId) : undefined;
  if (found !== undefined) return found;
  const proposal = review.derived.proposal.peek();
  if (!proposal) return undefined;
  const created = createdPageOf(proposal, itemId);
  if (created !== undefined) return created;
  const change =
    target?.level === 'change' && target.id
      ? proposalIndex(proposal).changes.get(target.id)
      : undefined;
  return change ? carriedPage(change) : undefined;
}

/**
 * Opens the page of the review item before it is selected. The review keeps the Completa locked, so
 * only the page changes; a page the proposal itself creates cannot be opened and stays where it is.
 */
export function revealReviewItem(
  session: RevealSession,
  review: Pick<ReviewState, 'derived'>,
  target: ReviewTarget | null,
  itemId: string,
): void {
  const pageId = reviewPageOf(review, target, itemId);
  if (pageId === undefined) {
    revealItem(session, itemId);
    return;
  }
  if (pageId !== session.page.openId()) session.page.open(pageId);
}
