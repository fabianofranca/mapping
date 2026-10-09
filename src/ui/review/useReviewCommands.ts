import { t } from '../../i18n';
import { showToolWindow } from '../../store/toolWindows';
import { showToast } from '../../store/ui';
import { DESKTOP_QUERY } from '../../theme/breakpoints';
import type { ProposalActionError } from '../../store/proposalActions';
import { useEditor } from '../EditorContext';
import { proposalErrorMessage } from '../labels';
import { useMediaQuery } from '../useMediaQuery';

/** Quanto tempo um aviso de erro da revisão fica à vista. */
export const REVIEW_ERROR_MS = 6000;

export interface ReviewCommands {
  /** Abre a proposta na revisão: janelas Propostas e Detalhes (desktop) ou o canvas (celular). */
  openReview(proposalId: string): boolean;
  /** Mostra a mensagem de uma ação recusada. */
  report(error: ProposalActionError, path?: string): void;
}

/** Comandos da revisão usados pela lista, pelo aviso de proposta nova e pela barra de status. */
export function useReviewCommands(): ReviewCommands {
  const { review, ui } = useEditor();
  const desktop = useMediaQuery(DESKTOP_QUERY);
  const report = (error: ProposalActionError, path?: string) =>
    showToast(ui, proposalErrorMessage(error, path), REVIEW_ERROR_MS);
  return {
    report,
    openReview(proposalId) {
      const result = review.open(proposalId);
      if (!result.ok) {
        if (result.error === 'withdrawn') {
          showToast(ui, t('proposals.withdrawnInfo'), REVIEW_ERROR_MS);
        } else
          report(result.error === 'unknown-proposal' ? 'unknown-proposal' : 'no-project');
        return false;
      }
      if (desktop) {
        showToolWindow('details');
        showToolWindow('proposals');
      } else {
        // Celular: a revisão acontece no canvas, com a faixa e a gaveta (M2-Revisao).
        ui.mobileWindow.value = null;
      }
      if (result.newConflicts > 0) {
        showToast(
          ui,
          t('review.newConflicts', { count: result.newConflicts }),
          REVIEW_ERROR_MS,
        );
      }
      return true;
    },
  };
}
