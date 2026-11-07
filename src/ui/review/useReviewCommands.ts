import { t } from '../../i18n';
import { showToast } from '../../store/ui';
import type { ProposalActionError } from '../../store/proposalActions';
import { useEditor, type EditorContextValue } from '../EditorContext';
import { proposalErrorMessage } from '../labels';
import { openToolWindow } from '../toolWindowLayout';

/** Quanto tempo um aviso de erro da revisão fica à vista. */
export const REVIEW_ERROR_MS = 6000;

export interface ReviewCommands {
  /** Abre a proposta na revisão: janelas Propostas e Detalhes. */
  openReview(proposalId: string): boolean;
  /** Mostra a mensagem de uma ação recusada. */
  report(error: ProposalActionError, path?: string): void;
}

type Reporter = (error: ProposalActionError, path?: string) => void;

function reporterOf(editor: EditorContextValue): Reporter {
  return (error, path) =>
    showToast(editor.ui, proposalErrorMessage(error, path), REVIEW_ERROR_MS);
}

/**
 * Abre a proposta na revisão (janelas Propostas e Detalhes) e avisa por toast quando não dá.
 * Sem hook: serve ao clique de um chip de citação, que tem o contexto do editor na mão.
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
  // Volta ao último item visto: mostra-o no canvas depois do desenho seguinte.
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

/** Comandos da revisão usados pela lista, pelo aviso de proposta nova e pela barra de status. */
export function useReviewCommands(): ReviewCommands {
  const editor = useEditor();
  return {
    report: reporterOf(editor),
    openReview: (proposalId) => openReviewIn(editor, proposalId),
  };
}
