import { useEffect, useRef } from 'preact/hooks';
import { t } from '../../i18n';
import { needsExitReminder } from '../../model';
import { Button } from '../controls';
import { Dialog } from '../Dialog';
import { reviewExitTarget } from '../toolWindowLayout';
import { useEditor } from '../EditorContext';
import { DecisionMark } from './DecisionMark';
import { useApplyAccepted } from './useReview';

// Lembrete ao sair da revisão (HANDOFF-PROPOSALS 5.3): com aceitas ainda não aplicadas,
// sair pergunta (a regra é `needsExitReminder`, do modelo; quem decide mostrar é
// `app/useExitReview.ts`). Nada se perde em nenhum caso: as decisões e as notas ficam na
// proposta. Ações: Aplicar agora · N (principal), Sair mesmo assim e Continuar revisando.

export function ExitReviewDialog({ onClose }: { readonly onClose: () => void }) {
  const { review } = useEditor();
  const apply = useApplyAccepted();
  const counts = review.derived.counts.value;
  const canApply = review.derived.canApply.value;
  // A proposta de quando o diálogo abriu: sair zera `proposalId` antes do foco voltar.
  const proposalId = useRef(review.proposalId.peek());
  const exit = () => {
    onClose();
    review.close();
  };
  // O clique em "Sair" decidiu pelo estado de antes de uma aplicação em andamento terminar:
  // se, já aberto, o lembrete deixou de valer (nada aguarda mais), sai sem perguntar.
  const reminder = needsExitReminder(
    review.derived.proposal.value?.status,
    counts.acceptedPending,
  );
  useEffect(() => {
    if (!reminder) exit();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reminder]);
  return (
    <Dialog
      title={t('review.exitDialog.title')}
      onCancel={onClose}
      // "Continuar revisando" volta ao botão da faixa; sair leva ao botão da proposta.
      returnFocus={() => reviewExitTarget(proposalId.current)}
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
