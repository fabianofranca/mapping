import { useEditor } from '../ui/EditorContext';
import { needsExitReminder } from '../ui/review/ExitReviewDialog';
import type { EditorDialogs } from './useEditorDialogs';

/**
 * Sair da revisão: nunca perde nada; com aceitas ainda não aplicadas, lembra antes
 * (HANDOFF-PROPOSALS 5.3). Usado pela faixa da revisão, pela barra de cima do celular e
 * pelo menu Painéis.
 */
export function useExitReview(dialogs: EditorDialogs): () => void {
  const { review } = useEditor();
  return () => {
    const p = review.derived.proposal.peek();
    if (needsExitReminder(p?.status, review.derived.counts.peek().acceptedPending)) {
      dialogs.show({ kind: 'exitReview' });
    } else review.close();
  };
}
