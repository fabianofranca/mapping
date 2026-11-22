import { t } from '../../i18n';
import { Button } from '../controls';
import { useEditor } from '../EditorContext';
import { Notice } from '../Notice';
import { openReviewIn } from './useReviewCommands';

// The way back to the review (stage #1881, decision 20): after the person leaves the review of a
// proposal that is still open, Details shows this notice above any panel, with Review and a dismiss
// button. It hides when the proposal is no longer open or any review opens.

export function ReviewReturnNotice() {
  const editor = useEditor();
  const { ui, review } = editor;
  const id = ui.reviewReturn.value;
  if (id === null || review.proposalId.value !== null) return null;
  const row = review.derived.rows.value.find((r) => r.proposal.id === id);
  if (!row || row.proposal.status !== 'open') return null;
  const { title } = row.proposal;
  return (
    <Notice
      tone="info"
      icon="proposal"
      size="sm"
      class="review-return-notice"
      actions={
        <>
          <Button
            size="sm"
            variant="primary"
            aria-label={`${t('proposals.action.review')}: ${title}`}
            onClick={() => openReviewIn(editor, id)}
          >
            {t('proposals.action.review')}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              ui.reviewReturn.value = null;
            }}
          >
            {t('review.returnDismiss')}
          </Button>
        </>
      }
    >
      <span>{t('review.returnNotice', { title })}</span>
    </Notice>
  );
}
