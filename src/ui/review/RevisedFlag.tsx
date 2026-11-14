import { t } from '../../i18n';
import type { Proposal, RevisionMark } from '../../model';
import { revisionMark } from '../../model';
import { locale } from '../../store/settings';
import { Tooltip } from '../controls';
import { Flag } from './Flag';
import { formatFullDate } from './format';
import { revisionParts, type RevisionCounts } from './revisedText';

/** The summary of the newest revision (`review.derived.revisionSummary`). */
export interface RevisionSummary extends RevisionCounts {
  readonly at: string;
}

// "Revised" badge (stage #644, CP3): the mark of a change that the agent replaced or
// added in a revision and that has no decision yet. On the row of an item or image that
// contains it, the same badge with the general tooltip. The tooltip lives in the Tooltip and the text also goes to the
// screen reader, inside the badge.

/** What the badge says: the replaced change, the one new in the revision or a level that contains one of them. */
export type RevisedBadge =
  | { readonly kind: 'changed' | 'added'; readonly at: string }
  | { readonly kind: 'contains' };

/** The badge of a change with a visible mark, or `null`. */
export function changeBadge(
  p: Proposal,
  revisedIds: ReadonlySet<string>,
  changeId: string,
): RevisedBadge | null {
  if (!revisedIds.has(changeId)) return null;
  const mark: RevisionMark | null = revisionMark(p, changeId);
  return mark ? { kind: mark.kind, at: mark.at } : null;
}

/** The badge of an image or item: `contains` if any of its changes has a visible mark (the proposal does not carry it). */
export function levelBadge(
  level: string,
  revisedIds: ReadonlySet<string>,
  changeIds: readonly string[],
): RevisedBadge | null {
  if (level === 'proposal') return null;
  return changeIds.some((id) => revisedIds.has(id)) ? { kind: 'contains' } : null;
}

/** Text of the badge's tooltip. */
export function badgeHint(badge: RevisedBadge): string {
  if (badge.kind === 'contains') return t('review.revised.markHint');
  const date = formatFullDate(badge.at, locale.value);
  return t(
    badge.kind === 'changed' ? 'review.revised.hintChanged' : 'review.revised.hintAdded',
    {
      date,
    },
  );
}

/** Text of the badge. */
export function badgeText(badge: RevisedBadge): string {
  return t(badge.kind === 'added' ? 'review.revised.markAdded' : 'review.revised.mark');
}

export function RevisedFlag({ badge }: { readonly badge: RevisedBadge }) {
  const hint = badgeHint(badge);
  return (
    <Tooltip label={hint}>
      <Flag tone="new">
        {badgeText(badge)}
        <span class="visually-hidden">{hint}</span>
      </Flag>
    </Tooltip>
  );
}

/** "Revised by the agent on <date>: 1 replaced, 2 new" in the proposal header. */
export function RevisionLine({ summary }: { readonly summary: RevisionSummary | null }) {
  if (!summary) return null;
  return (
    <p class="review-hint muted">
      {t('review.revised.header', {
        date: formatFullDate(summary.at, locale.value),
        parts: revisionParts(summary),
      })}
    </p>
  );
}
