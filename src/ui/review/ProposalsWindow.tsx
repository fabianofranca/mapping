import { t } from '../../i18n';
import { showToast } from '../../store/ui';
import { useEditor } from '../EditorContext';
import { IconButton } from '../controls';
import { DESKTOP_QUERY } from '../../theme/breakpoints';
import { useMediaQuery } from '../useMediaQuery';
import { REVIEW_KEYS } from './DecisionControl';
import { ProposalList } from './ProposalList';
import { ReviewLevels } from './ReviewLevels';

// Conteúdo da janela Propostas (inferior no desktop; tela cheia no celular): a lista de
// propostas fora da revisão e os níveis da proposta aberta em modo revisão.

export interface ProposalsWindowProps {
  /** Abre a Ajuda na seção das propostas. */
  readonly onHelp: () => void;
}

/** Confere a pasta agora (propostas novas, alteradas ou apagadas por fora). */
export function useScanProposals(): () => void {
  const { session, ui } = useEditor();
  return () => {
    session.proposals.scan().then(
      (found) => {
        const changes = found.added.length + found.changed.length + found.removed.length;
        showToast(
          ui,
          changes === 0
            ? t('proposals.scanNothing')
            : t('proposals.scanFound', { count: changes }),
        );
      },
      () => showToast(ui, t('proposals.scanFailed')),
    );
  };
}

/**
 * Ações do cabeçalho: fora da revisão, "Verificar a pasta agora"; na revisão, "Próxima
 * pendente" (N).
 */
export function ProposalsHeaderActions() {
  const { review, canvas } = useEditor();
  const scan = useScanProposals();
  if (review.proposalId.value !== null) {
    return (
      <IconButton
        icon="arrowDown"
        label={t('review.nextPending')}
        shortcut={REVIEW_KEYS.nextPending}
        disabled={review.derived.pendingIds.value.length === 0}
        onClick={() => {
          if (review.step('pending', 1)) canvas.current?.focusSelection();
        }}
      />
    );
  }
  return <IconButton icon="refresh" label={t('proposals.scan')} onClick={scan} />;
}

export function ProposalsWindow({ onHelp }: ProposalsWindowProps) {
  const { review } = useEditor();
  const scan = useScanProposals();
  const desktop = useMediaQuery(DESKTOP_QUERY);
  const id = review.proposalId.value;
  if (id !== null) return <ReviewLevels key={id} desktop={desktop} />;
  return <ProposalList onHelp={onHelp} onScan={scan} />;
}
