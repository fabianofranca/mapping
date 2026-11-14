import { needsExitReminder } from '../model';
import { useEditor } from '../ui/EditorContext';
import { focusReviewExitTarget } from '../ui/toolWindowLayout';
import type { EditorDialogs } from './useEditorDialogs';

/**
 * Leaving the review: never loses anything; with accepted changes not yet applied, it reminds first
 * (HANDOFF-PROPOSALS 5.3). Used by the review strip.
 */
export function useExitReview(dialogs: EditorDialogs): () => void {
  const { review } = useEditor();
  return () => {
    const p = review.derived.proposal.peek();
    if (needsExitReminder(p?.status, review.derived.counts.peek().acceptedPending)) {
      dialogs.show({ kind: 'exitReview' });
    } else {
      const id = review.proposalId.peek();
      review.close();
      focusReviewExitTarget(id);
    }
  };
}
