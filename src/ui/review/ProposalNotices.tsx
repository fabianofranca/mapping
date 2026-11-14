import { t } from '../../i18n';
import type { ProposalNotice } from '../../store/proposals';
import { Button } from '../controls';
import { useEditor } from '../EditorContext';
import { proposalNoticeMessage } from '../labels';
import { ImageConsentBanner } from '../ImageConsentBanner';
import { Notice } from '../Notice';
import { revisionParts } from './revisedText';
import { useReviewCommands } from './useReviewCommands';
import { undoMessage } from './useReview';

// Discreet notice in the canvas corner when a proposal arrives, changes or goes away outside
// (`session.proposals.notices`, checked together with `mapping.json`). The new proposal gets
// "Review"; closing the notice clears the queue (the proposals stay in the window). Opening the
// proposal in review, by any path, takes its notice off the queue (`review.open`), so the interface
// does not need to hide it on its own.

/**
 * "Undo" of the batches and the dependencies (HANDOFF-PROPOSALS 8.3): after "Accept
 * all", a level decision or one that took others along, the notice says how many
 * changed and offers to undo in a single write. It goes away on the next action.
 */
export function ReviewUndoNotice() {
  const { review } = useEditor();
  const undo = review.undoable.value;
  if (!undo || (undo.changed.length <= 1 && undo.cascaded.length === 0)) return null;
  return (
    <Notice
      tone="info"
      size="sm"
      onDismiss={() => review.dismissUndo()}
      actions={
        <Button size="sm" onClick={() => void review.undoLastDecision()}>
          {t('review.undo')}
        </Button>
      }
    >
      <span>{undoMessage(undo.changed.length, undo.cascaded.length, undo.state)}</span>
    </Notice>
  );
}

export function ProposalNotices() {
  return (
    <div class="canvas-corner">
      <ReviewUndoNotice />
      <ProposalNotice />
      <ImageConsentBanner />
    </div>
  );
}

const NO_REVISION = { changed: 0, added: 0, dropped: 0 };

/** "The agent revised <title>: 1 swapped…" with Review, unless that revision is already open. */
function RevisedNotice({
  notice,
  more,
  onDismiss,
}: {
  readonly notice: ProposalNotice;
  readonly more: string | null;
  readonly onDismiss: () => void;
}) {
  const { review } = useEditor();
  const { openReview } = useReviewCommands();
  const text = t('review.revisedNotice.text', {
    title: notice.title,
    parts: revisionParts(notice.revision ?? NO_REVISION),
  });
  const showReview = review.proposalId.value !== notice.id;
  return (
    <Notice
      tone="info"
      icon="proposal"
      onDismiss={onDismiss}
      actions={
        showReview && (
          <Button
            size="sm"
            aria-label={t('review.revisedNotice.reviewLabel', { title: notice.title })}
            onClick={() => {
              if (openReview(notice.id)) onDismiss();
            }}
          >
            {t('review.revisedNotice.review')}
          </Button>
        )
      }
    >
      <span>{text}</span>
      {more && <span class="muted">{more}</span>}
    </Notice>
  );
}

function ProposalNotice() {
  const { session } = useEditor();
  const { openReview } = useReviewCommands();
  const notices = session.proposals.notices.value;
  const latest = notices.at(-1);
  if (!latest) return null;
  const others = notices.length - 1;
  const dismiss = () => session.proposals.clearNotices();
  const more = others > 0 ? t('proposals.noticeMore', { count: others }) : null;
  if (latest.kind === 'revised') {
    return <RevisedNotice notice={latest} more={more} onDismiss={dismiss} />;
  }
  return latest.kind === 'added' ? (
    <Notice
      tone="info"
      icon="proposal"
      title={t('proposals.noticeNewTitle')}
      onDismiss={dismiss}
      actions={
        <Button
          size="sm"
          onClick={() => {
            if (openReview(latest.id)) dismiss();
          }}
        >
          {t('proposals.action.review')}
        </Button>
      }
    >
      <span class="notice-box-text">{latest.title}</span>
      {more && <span class="muted">{more}</span>}
    </Notice>
  ) : (
    <Notice tone="info" icon="proposal" onDismiss={dismiss}>
      <span>{proposalNoticeMessage(latest)}</span>
      {more && <span class="muted">{more}</span>}
    </Notice>
  );
}
