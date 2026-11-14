import type { ComponentChildren } from 'preact';
import { t } from '../../i18n';
import {
  canRemoveProposal,
  proposalListStatus,
  type ProposalListFlag,
} from '../../model';
import type { ProposalRow as ProposalRowData } from '../../store/derived';
import { locale } from '../../store/settings';
import { ActionMenu } from '../ActionMenu';
import { Button } from '../controls';
import { Icon } from '../icons';
import { DecisionMark } from './DecisionMark';
import { Flag, type FlagTone } from './Flag';
import { formatFullDate, formatWhen, joinParts } from './format';
import { ProposalThreadLink } from './ProposalThreadLink';

// Proposal list row (HANDOFF-PROPOSALS 5.1 and the ProposalRow component): set
// state, title with the status, context (origin · author · date), counts and the
// "N accepted awaiting application" line; Review, Continue or View action. It only reads the derived state; the
// status rule is `proposalListStatus`, from the model.

export type ProposalAction = 'review' | 'continue' | 'view';

export interface ProposalStatusView {
  readonly flag: { readonly tone: FlagTone; readonly text: string } | null;
  readonly action: ProposalAction;
  /** The action is the window's main one (the proposal that arrived and nobody opened). */
  readonly primary: boolean;
}

const FLAG_TONES: Record<ProposalListFlag, FlagTone> = {
  new: 'new',
  inReview: 'neutral',
  superseded: 'warn',
  applied: 'ok',
  withdrawn: 'neutral',
};

/**
 * Status shown and action of a row: every `fresh` row carries the "New" seal and the
 * main action (the same truth as the status bar count; phase 8.2, P4).
 */
export function proposalStatus(row: ProposalRowData): ProposalStatusView {
  const status = proposalListStatus(row.proposal, row.progress, row.fresh);
  const { flag } = status;
  return {
    flag: flag ? { tone: FLAG_TONES[flag], text: t(`proposals.status.${flag}`) } : null,
    action: status.action,
    primary: status.primary,
  };
}

/** "2 accepted and 4 undecided were left behind" (superseded proposal). */
export function leftBehindText(row: ProposalRowData): string | null {
  const behind = row.leftBehind;
  if (!behind) return null;
  const accepted = behind.acceptedPending.length;
  const undecided = behind.undecided.length;
  if (accepted === 0 && undecided === 0) return t('proposals.leftBehindNone');
  if (undecided === 0) return t('proposals.leftBehindAccepted', { accepted });
  if (accepted === 0) return t('proposals.leftBehindUndecided', { undecided });
  return t('proposals.leftBehind', { accepted, undecided });
}

/** "N accepted awaiting application" (with the singular). */
export function awaitingText(count: number): string {
  return count === 1
    ? t('proposals.awaitingOne')
    : t('proposals.awaitingMany', { count });
}

function Count({
  label,
  value,
  children,
}: {
  readonly label: string;
  readonly value: number;
  readonly children: ComponentChildren;
}) {
  return (
    <span class="review-count" title={label}>
      {children}
      <span>{value}</span>
      <span class="visually-hidden">{label}</span>
    </span>
  );
}

/** Counts pending · accepted · rejected · conflicts, with the state shown by shape. */
export function DecisionCounts({
  undecided,
  accepted,
  rejected,
  conflicts,
}: {
  readonly undecided: number;
  readonly accepted: number;
  readonly rejected: number;
  readonly conflicts?: number;
}) {
  return (
    <span class="review-counts">
      <Count label={t('review.count.undecided')} value={undecided}>
        <DecisionMark state="undecided" decorative />
      </Count>
      <Count label={t('review.count.accepted')} value={accepted}>
        <DecisionMark state="accepted" decorative />
      </Count>
      <Count label={t('review.count.rejected')} value={rejected}>
        <DecisionMark state="rejected" decorative />
      </Count>
      {conflicts !== undefined && conflicts > 0 && (
        <span class="review-count review-count-warn" title={t('review.count.conflicts')}>
          <Icon name="warning" />
          <span>{conflicts}</span>
          <span class="visually-hidden">{t('review.count.conflicts')}</span>
        </span>
      )}
    </span>
  );
}

interface ProposalRowProps {
  readonly row: ProposalRowData;
  /** Now (for the relative date). */
  readonly now: Date;
  readonly onAction: (row: ProposalRowData, action: ProposalAction) => void;
  /** "Open the new one": the proposal that superseded this one (`row.supersededBy`). */
  readonly onOpenNewer: (proposalId: string) => void;
  /**
   * "Delete proposal…" of the ⋯ menu (phase 9.2). Only on rows that are not open, and only if
   * the window passes the callback: the list passes it, the review has no proposal rows.
   */
  readonly onRemove?: (row: ProposalRowData) => void;
  /** The ⋯ menu is disabled (read-only project). */
  readonly removeDisabled?: boolean;
}

export function ProposalRow({
  row,
  now,
  onAction,
  onOpenNewer,
  onRemove,
  removeDisabled = false,
}: ProposalRowProps) {
  const { proposal: p, progress } = row;
  const status = proposalStatus(row);
  const lang = locale.value;
  const meta = joinParts([p.origin, p.author, formatWhen(p.createdAt, now, lang)]);
  const behind = leftBehindText(row);
  const awaiting =
    p.status === 'open' && progress.acceptedPending > 0
      ? awaitingText(progress.acceptedPending)
      : null;
  const actionLabel = t(`proposals.action.${status.action}`);
  // Who superseded it comes from the new one's `supersedes`, not from this one's status: an already
  // applied proposal is history and stays "Applied · superseded by …" (finding 13).
  const newer = row.supersededBy;
  return (
    <div class="proposal-row" role="listitem" data-proposal={p.id} data-status={p.status}>
      <div class="proposal-row-main">
        <DecisionMark
          state={progress.state}
          counts={progress}
          label={t('proposals.progressLabel', {
            accepted: progress.accepted,
            rejected: progress.rejected,
            undecided: progress.undecided,
          })}
        />
        <div class="proposal-row-text">
          <div class="proposal-row-title">
            <b title={p.title}>{p.title}</b>
            {status.flag && <Flag tone={status.flag.tone}>{status.flag.text}</Flag>}
            {newer && p.status !== 'superseded' && (
              <span class="muted proposal-row-newer" title={newer.title}>
                {t('proposals.supersededBy', { title: newer.title })}
              </span>
            )}
          </div>
          <div class="proposal-row-meta" title={formatFullDate(p.createdAt, lang)}>
            {meta}
          </div>
          <ProposalThreadLink proposalId={p.id} />
        </div>
      </div>
      <div class="proposal-row-counts">
        {p.status === 'open' && (
          <DecisionCounts
            undecided={progress.undecided}
            accepted={progress.accepted}
            rejected={progress.rejected}
            conflicts={row.conflicts}
          />
        )}
        {p.status === 'applied' && (
          <span class="muted">
            {progress.applied === 1
              ? t('proposals.appliedCountOne')
              : t('proposals.appliedCount', { count: progress.applied })}
          </span>
        )}
        {p.status === 'withdrawn' && (
          <span class="muted">
            {t('proposals.withdrawnCount', { count: progress.total })}
          </span>
        )}
        {row.revised > 0 && (
          <span class="proposal-row-await">
            {t('proposals.row.revised', { count: row.revised })}
          </span>
        )}
        {behind && <span class="proposal-row-await proposal-row-warn">{behind}</span>}
        {awaiting && (
          <span class="proposal-row-await">
            <DecisionMark state="accepted" decorative />
            {awaiting}
          </span>
        )}
      </div>
      <div class="proposal-row-action">
        {newer && (
          <Button
            variant="ghost"
            aria-label={t('review.superseded.openNewNamed', { title: newer.title })}
            onClick={() => onOpenNewer(newer.id)}
          >
            {t('review.superseded.openNew')}
          </Button>
        )}
        <Button
          variant={status.primary ? 'primary' : 'default'}
          aria-label={`${actionLabel}: ${p.title}`}
          data-proposal-action=""
          onClick={() => onAction(row, status.action)}
        >
          {actionLabel}
        </Button>
        {onRemove && canRemoveProposal(p) && (
          <ActionMenu
            label={t('proposals.rowActions', { title: p.title })}
            disabled={removeDisabled}
            items={[
              {
                label: t('proposals.remove'),
                danger: true,
                onSelect: () => onRemove(row),
              },
            ]}
          />
        )}
      </div>
    </div>
  );
}
