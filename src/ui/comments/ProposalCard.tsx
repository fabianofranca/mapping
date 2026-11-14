import { t } from '../../i18n';
import type { ProposalRow } from '../../store/derived';
import { Button } from '../controls';
import { useEditor } from '../EditorContext';
import { Icon } from '../icons';
import { openReviewIn } from '../review/useReviewCommands';

// The proposal card in a thread (decision 36): the message with `proposal` shows the proposal's
// title, how many changes are left to review and the button that opens the review. The message text
// stays below the card.

/** "N change(s) to review" (with the singular) or, once decided, the state in short text. */
export function proposalStateText(row: ProposalRow): string {
  const { proposal, progress } = row;
  if (proposal.status !== 'open') return t(`proposals.status.${proposal.status}`);
  if (progress.undecided === 0) return t('thread.proposal.allDecided');
  return progress.undecided === 1
    ? t('thread.proposal.changesOne')
    : t('thread.proposal.changesMany', { count: progress.undecided });
}

/** The card action: Review on open ones, View on closed ones and nothing on withdrawn ones. */
function cardAction(row: ProposalRow): 'review' | 'view' | null {
  switch (row.proposal.status) {
    case 'open':
      return 'review';
    case 'withdrawn':
      return null;
    default:
      return 'view';
  }
}

export function ProposalCard({ proposalId }: { readonly proposalId: string }) {
  const editor = useEditor();
  const row = editor.review.derived.rows.value.find((r) => r.proposal.id === proposalId);
  if (!row) {
    return (
      <div class="proposal-card proposal-card-removed" data-proposal-card="">
        <Icon name="proposal" />
        <span class="muted">{t('thread.proposal.removed')}</span>
      </div>
    );
  }
  const { title } = row.proposal;
  const action = cardAction(row);
  const label = action === null ? '' : t(`proposals.action.${action}`);
  return (
    <div
      class="proposal-card"
      role="group"
      aria-label={t('thread.proposal.cardLabel', { title })}
      data-proposal-card=""
      data-status={row.proposal.status}
    >
      <Icon name="proposal" />
      <div class="proposal-card-text">
        <b class="proposal-card-title" title={title}>
          {title}
        </b>
        <span class="muted proposal-card-state">{proposalStateText(row)}</span>
      </div>
      {action !== null && (
        <Button
          size="sm"
          variant={action === 'review' ? 'primary' : 'default'}
          aria-label={`${label}: ${title}`}
          onClick={() => openReviewIn(editor, row.proposal.id)}
        >
          {label}
        </Button>
      )}
    </div>
  );
}
