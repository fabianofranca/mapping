import type { ComponentChildren } from 'preact';
import { ariaKeys } from '../../app/shortcuts';
import { t } from '../../i18n';
import { hasActiveFilters } from '../../model';
import { BREAKPOINTS } from '../../theme/breakpoints';
import { Button } from '../controls';
import { useEditor } from '../EditorContext';
import { Icon } from '../icons';
import { MenuPopover } from '../MenuPopover';
import { useMediaQuery } from '../useMediaQuery';
import { REVIEW_KEYS } from './DecisionControl';
import { DecisionMark } from './DecisionMark';
import { Flag } from './Flag';
import { ProgressBar } from './ReviewLevels';
import { reviewBarRef } from './reviewBarRef';
import {
  useApplyAccepted,
  useConcludeReview,
  useDecideVisible,
  useShowProblem,
} from './useReview';

// Review mode strip (HANDOFF-PROPOSALS 5.2, ReviewBar): REVIEW badge, title,
// source, progress, counts and the four actions (Reject all changes, Accept all changes, Apply
// accepted · N, the only primary, and Exit review). With active filters, the bulk action only
// applies to what the list shows. Below 1200px it is compact (counts with only an icon and the
// bulk action in a "Bulk" menu).

function Stat({
  label,
  value,
  compact,
  warn,
  children,
}: {
  readonly label: string;
  readonly value: number;
  readonly compact: boolean;
  readonly warn?: boolean;
  readonly children: ComponentChildren;
}) {
  return (
    <span class={warn ? 'review-stat review-stat-warn' : 'review-stat'} title={label}>
      {children}
      <b>{value}</b>
      <span class={compact ? 'visually-hidden' : 'review-stat-label'}>{label}</span>
    </span>
  );
}

/** Why "Apply accepted" is disabled, in the order of precedence; `null` when nothing blocks it. */
function applyBlockedReason(
  readOnly: boolean,
  applying: boolean,
  acceptedPending: number,
  invalid: boolean,
): string | null {
  if (readOnly) return t('proposal.error.readOnly');
  if (applying) return t('review.applying');
  if (acceptedPending === 0) return t('review.applyNone');
  if (invalid) return t('review.applyBlocked');
  return null;
}

/** Label of "Apply accepted · N" (or "Conclude review") and the reason it is disabled. */
export function useApplyState() {
  const { review, store } = useEditor();
  const d = review.derived;
  const counts = d.counts.value;
  const validation = d.validation.value;
  const canApply = d.canApply.value;
  // A decided review (stage #2085): the same button concludes the proposal instead of applying.
  if (d.canConclude.value) {
    return {
      label: t('review.concludeLabel'),
      disabled: false,
      tooltip: t('review.concludeTip'),
      blocked: false,
      issues: 0,
      conclude: true,
    };
  }
  const label = t('review.applyCount', { count: counts.acceptedPending });
  const reason = applyBlockedReason(
    store.readOnly.value,
    d.applying.value,
    counts.acceptedPending,
    validation !== null && !validation.ok,
  );
  return {
    label,
    disabled: !canApply,
    tooltip: reason ?? t('review.applyTip'),
    blocked: validation !== null && !validation.ok,
    issues: validation?.issues.length ?? 0,
    conclude: false,
  };
}

export function ReviewBar({ onExit }: { readonly onExit: () => void }) {
  const { review } = useEditor();
  const compact = useMediaQuery(`(max-width: ${BREAKPOINTS.compact}px)`);
  // Below the reference width (1440px), the counts show only an icon and a number.
  const narrow = useMediaQuery(`(max-width: ${BREAKPOINTS.design - 1}px)`);
  const d = review.derived;
  const p = d.proposal.value;
  const decideVisible = useDecideVisible();
  const apply = useApplyAccepted();
  const conclude = useConcludeReview();
  const showProblem = useShowProblem();
  const applyState = useApplyState();
  if (!p) return null;
  const counts = d.counts.value;
  const filtered = hasActiveFilters(review.filters.value);
  const shown = d.visibleIds.value.length;
  const open = p.status === 'open';
  const acceptLabel = filtered
    ? t('review.acceptShown', { count: shown })
    : t('review.acceptAll');
  const rejectLabel = filtered
    ? t('review.rejectShown', { count: shown })
    : t('review.rejectAll');
  const bulkDisabled = !open || (filtered && shown === 0);

  const bulk = compact ? (
    <MenuPopover label={t('review.bulk')} buttonLabel={t('review.bulkName')}>
      <Button
        role="menuitem"
        disabled={bulkDisabled}
        onClick={() => decideVisible('accepted')}
      >
        <Icon name="check" />
        {acceptLabel}
      </Button>
      <Button
        role="menuitem"
        disabled={bulkDisabled}
        onClick={() => decideVisible('rejected')}
      >
        <Icon name="close" />
        {rejectLabel}
      </Button>
    </MenuPopover>
  ) : (
    <>
      <Button
        title={filtered ? t('review.rejectShownTip') : t('review.rejectAllTip')}
        disabled={bulkDisabled}
        onClick={() => decideVisible('rejected')}
      >
        <Icon name="close" />
        {rejectLabel}
      </Button>
      <Button
        title={filtered ? t('review.acceptShownTip') : t('review.acceptAllTip')}
        disabled={bulkDisabled}
        onClick={() => decideVisible('accepted')}
      >
        <Icon name="check" />
        {acceptLabel}
      </Button>
    </>
  );

  return (
    <section class="review-bar" ref={reviewBarRef} aria-label={t('review.region')}>
      <div class="review-bar-id">
        <span class="review-badge">
          <Icon name="proposal" />
          {t('review.mode')}
        </span>
        <span class="review-bar-title" title={p.title}>
          {p.title}
        </span>
        {p.status === 'superseded' && (
          <Flag tone="warn">{t('proposals.status.superseded')}</Flag>
        )}
        {p.status === 'applied' && <Flag tone="ok">{t('proposals.status.applied')}</Flag>}
        {p.status === 'rejected' && (
          <Flag tone="neutral">{t('proposals.status.rejected')}</Flag>
        )}
        {!compact && p.origin && (
          <span class="review-bar-origin" title={p.origin}>
            {p.origin}
          </span>
        )}
      </div>
      <div class="review-bar-stats">
        <ProgressBar summary={counts} />
        <Stat
          label={t('review.count.undecided')}
          value={counts.undecided}
          compact={narrow}
        >
          <DecisionMark state="undecided" decorative />
        </Stat>
        <Stat label={t('review.count.accepted')} value={counts.accepted} compact={narrow}>
          <DecisionMark state="accepted" decorative />
        </Stat>
        <Stat label={t('review.count.rejected')} value={counts.rejected} compact={narrow}>
          <DecisionMark state="rejected" decorative />
        </Stat>
        {counts.conflicts > 0 && (
          <Stat
            label={t('review.count.conflicts')}
            value={counts.conflicts}
            compact={narrow}
            warn
          >
            <Icon name="warning" />
          </Stat>
        )}
      </div>
      <div class="review-bar-actions">
        {applyState.blocked && (
          /* Exception to Button: clickable problem badge (docs/DESIGN-SYSTEM.md, "Loose buttons") */
          <button
            type="button"
            class="flag flag-danger review-bar-problem"
            title={t('review.problemTip')}
            onClick={showProblem}
          >
            <Icon name="warning" />
            {t('review.invalidSets', { count: applyState.issues })}
          </button>
        )}
        {filtered && (
          <span class="review-bar-note">
            <Icon name="filter" />
            {t('review.filtersOn')}
          </span>
        )}
        {bulk}
        <Button
          variant="primary"
          disabled={applyState.disabled}
          title={`${applyState.tooltip}  ${REVIEW_KEYS.apply}`}
          aria-keyshortcuts={ariaKeys(REVIEW_KEYS.apply)}
          onClick={() => void (applyState.conclude ? conclude() : apply())}
        >
          <Icon name="check" />
          {applyState.label}
        </Button>
        <Button variant="ghost" title={t('review.exitTip')} onClick={onExit}>
          {t('review.exit')}
        </Button>
      </div>
    </section>
  );
}
