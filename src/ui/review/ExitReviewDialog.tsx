import { t } from '../../i18n';
import { Button } from '../controls';
import { Dialog } from '../Dialog';
import { useEditor } from '../EditorContext';
import { DecisionMark } from './DecisionMark';
import { useApplyAccepted } from './useReview';

// Lembrete ao sair da revisão (HANDOFF-PROPOSALS 5.3): com aceitas ainda não aplicadas,
// sair pergunta. Nada se perde em nenhum caso: as decisões e as notas ficam na proposta.
// Ações: Aplicar agora · N (principal), Sair mesmo assim e Continuar revisando. No celular
// o diálogo ocupa a tela toda, com os botões empilhados.

/** Sair pede o lembrete? Só com aceitas aguardando aplicação numa proposta aplicável. */
export function needsExitReminder(
  status: string | undefined,
  acceptedPending: number,
): boolean {
  return acceptedPending > 0 && (status === 'open' || status === 'superseded');
}

export function ExitReviewDialog({ onClose }: { readonly onClose: () => void }) {
  const { review } = useEditor();
  const apply = useApplyAccepted();
  const counts = review.derived.counts.value;
  const canApply = review.derived.canApply.value;
  const exit = () => {
    onClose();
    review.close();
  };
  return (
    <Dialog
      title={t('review.exitDialog.title')}
      onCancel={onClose}
      actions={
        <div class="exit-review-actions">
          <Button onClick={onClose}>{t('review.exitDialog.continue')}</Button>
          <Button onClick={exit}>{t('review.exitDialog.exit')}</Button>
          <Button
            variant="primary"
            disabled={!canApply}
            onClick={() =>
              void apply().then((ok) => {
                if (ok) exit();
              })
            }
          >
            {t('review.exitDialog.apply', { count: counts.acceptedPending })}
          </Button>
        </div>
      }
    >
      <p>{t('review.exitDialog.text', { count: counts.acceptedPending })}</p>
      <ul class="exit-review-summary">
        <li>
          <DecisionMark state="accepted" decorative />
          {t('review.exitDialog.accepted', { count: counts.acceptedPending })}
        </li>
        <li>
          <DecisionMark state="rejected" decorative />
          {t('review.exitDialog.rejected', { count: counts.rejected })}
        </li>
        <li>
          <DecisionMark state="undecided" decorative />
          {t('review.exitDialog.undecided', { count: counts.undecided })}
        </li>
      </ul>
      <p class="muted">{t('review.exitDialog.nothingLost')}</p>
      {!canApply && <p class="muted">{t('review.applyBlocked')}</p>}
    </Dialog>
  );
}
