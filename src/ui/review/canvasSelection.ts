import { projectIndex, proposalIndex, type ReviewTarget } from '../../model';
import type { ReviewState } from '../../store/review';
import type { Selection } from '../../store/ui';

// A seleção do canvas que corresponde a um nível da revisão: uma função só para o painel de
// Detalhes (`ReviewPanel`) e para a sincronia com o canvas (`useReviewSync`).

/**
 * O item da revisão no canvas: a marcação, ou a seta (v13; os ids dividem o espaço), seja ela
 * do projeto à vista ou criada pela proposta.
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

/** Seleção do canvas que corresponde a um nível da revisão (`undefined`: não muda). */
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
