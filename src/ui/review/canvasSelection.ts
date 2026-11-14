import { projectIndex, proposalIndex, type ReviewTarget } from '../../model';
import type { ReviewState } from '../../store/review';
import type { Selection } from '../../store/ui';

// The canvas selection that corresponds to a review level: a single function for the Details
// panel (`ReviewPanel`) and for the sync with the canvas (`useReviewSync`).

/**
 * The review item on the canvas: the marking, or the arrow (v13; the ids share the space),
 * whether it is from the project in view or created by the proposal.
 */
function itemSelection(
  review: Pick<ReviewState, 'derived'>,
  id: string,
): NonNullable<Selection> {
  const shown = review.derived.shownProject.peek();
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
