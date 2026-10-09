import { t } from '../../i18n';
import { showToast } from '../../store/ui';
import { useEditor } from '../EditorContext';
import { IconButton } from '../controls';
import { ProposalList } from './ProposalList';

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

/** Ações do cabeçalho da janela fora da revisão: "Verificar a pasta agora". */
export function ProposalsHeaderActions() {
  const scan = useScanProposals();
  return <IconButton icon="refresh" label={t('proposals.scan')} onClick={scan} />;
}

export function ProposalsWindow({ onHelp }: ProposalsWindowProps) {
  const scan = useScanProposals();
  return <ProposalList onHelp={onHelp} onScan={scan} />;
}
