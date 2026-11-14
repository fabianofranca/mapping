import { useEffect, useRef } from 'preact/hooks';
import { t } from '../../i18n';
import { needsExitReminder } from '../../model';
import { Button } from '../controls';
import { Dialog } from '../Dialog';
import { reviewExitTarget } from '../toolWindowLayout';
import { useEditor } from '../EditorContext';
import { DecisionMark } from './DecisionMark';
import { useApplyAccepted } from './useReview';

// Reminder when leaving the review (HANDOFF-PROPOSALS 5.3): with accepted changes not yet applied,
// leaving asks (the rule is `needsExitReminder`, from the model; what decides to show it is
// `app/useExitReview.ts`). Nothing is lost in any case: the decisions and notes stay in the
// proposal. Actions: Apply now · N (main), Leave anyway and Keep reviewing.

export function ExitReviewDialog({ onClose }: { readonly onClose: () => void }) {
  const { review } = useEditor();
  const apply = useApplyAccepted();
  const counts = review.derived.counts.value;
  const canApply = review.derived.canApply.value;
  // The proposal from when the dialog opened: leaving resets `proposalId` before focus returns.
  const proposalId = useRef(review.proposalId.peek());
  const exit = () => {
    onClose();
    review.close();
  };
  // The click on "Leave" decided from the state before an application in progress finished:
  // if, once open, the reminder stopped applying (nothing awaits anymore), it leaves without asking.
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
      // "Keep reviewing" returns to the strip button; leaving goes to the proposal button.
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
