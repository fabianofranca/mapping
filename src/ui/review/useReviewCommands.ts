import { t } from '../../i18n';
import { showToast } from '../../store/ui';
import type { ProposalActionError } from '../../store/proposalActions';
import { useEditor, type EditorContextValue } from '../EditorContext';
import { proposalErrorMessage } from '../labels';
import { openToolWindow } from '../toolWindowLayout';

/** How long a review error warning stays in view. */
export const REVIEW_ERROR_MS = 6000;

export interface ReviewCommands {
  /** Opens the proposal in the review: Proposals and Details windows. */
  openReview(proposalId: string): boolean;
  /** Shows the message of a refused action. */
  report(error: ProposalActionError, path?: string): void;
}

type Reporter = (error: ProposalActionError, path?: string) => void;

function reporterOf(editor: EditorContextValue): Reporter {
  return (error, path) =>
    showToast(editor.ui, proposalErrorMessage(error, path), REVIEW_ERROR_MS);
}

/**
 * Opens the proposal in the review (Proposals and Details windows) and warns by toast when it
 * cannot. Not a hook: it serves the click of a citation chip, which has the editor context at hand.
 */
export function openReviewIn(editor: EditorContextValue, proposalId: string): boolean {
  const { review, ui, canvas } = editor;
  const report = reporterOf(editor);
  const result = review.open(proposalId);
  if (!result.ok) {
    if (result.error === 'withdrawn') {
      showToast(ui, t('proposals.withdrawnInfo'), REVIEW_ERROR_MS);
    } else
      report(result.error === 'unknown-proposal' ? 'unknown-proposal' : 'no-project');
    return false;
  }
  openToolWindow('details');
  openToolWindow('proposals');
  // Back to the last item seen: shows it on the canvas after the next draw.
  const center = () => canvas.current?.centerSelection();
  if (typeof requestAnimationFrame === 'function') requestAnimationFrame(center);
  if (result.resumed === 'full' && result.newConflicts === 0) {
    showToast(ui, t('review.resumed'));
  }
  if (result.newConflicts > 0) {
    showToast(
      ui,
      t('review.newConflicts', { count: result.newConflicts }),
      REVIEW_ERROR_MS,
    );
  }
  return true;
}

/** Review commands used by the list, by the new-proposal notice and by the status bar. */
export function useReviewCommands(): ReviewCommands {
  const editor = useEditor();
  return {
    report: reporterOf(editor),
    openReview: (proposalId) => openReviewIn(editor, proposalId),
  };
}
