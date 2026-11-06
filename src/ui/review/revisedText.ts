import { t } from '../../i18n';

// Textos da marca "Revisada" que dependem de contagens (etapa #644, CP3): as partes zeradas
// ficam de fora ("2 trocada(s), 1 retirada(s)").

export interface RevisionCounts {
  readonly changed: number;
  readonly added: number;
  readonly dropped: number;
}

/** "1 trocada(s), 2 nova(s)": só as contagens maiores que zero; "nenhuma mudança" sem nenhuma. */
export function revisionParts(counts: RevisionCounts): string {
  const parts = (['changed', 'added', 'dropped'] as const)
    .filter((key) => counts[key] > 0)
    .map((key) => t(`review.revised.part.${key}`, { count: counts[key] }));
  return parts.length > 0 ? parts.join(', ') : t('review.revised.part.none');
}
