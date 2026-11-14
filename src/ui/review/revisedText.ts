import { t } from '../../i18n';

// Texts of the "Revised" mark that depend on counts (stage #644, CP3): zero parts
// are left out ("2 replaced, 1 withdrawn").

export interface RevisionCounts {
  readonly changed: number;
  readonly added: number;
  readonly dropped: number;
}

/** "1 replaced, 2 new": only the counts greater than zero; "no changes" when there are none. */
export function revisionParts(counts: RevisionCounts): string {
  const parts = (['changed', 'added', 'dropped'] as const)
    .filter((key) => counts[key] > 0)
    .map((key) => t(`review.revised.part.${key}`, { count: counts[key] }));
  return parts.length > 0 ? parts.join(', ') : t('review.revised.part.none');
}
