import { t } from '../../i18n';
import type { Proposal, RevisionMark } from '../../model';
import { revisionMark } from '../../model';
import { locale } from '../../store/settings';
import { Tooltip } from '../controls';
import { Flag } from './Flag';
import { formatFullDate } from './format';
import { revisionParts, type RevisionCounts } from './revisedText';

/** O resumo da revisão mais nova (`review.derived.revisionSummary`). */
export interface RevisionSummary extends RevisionCounts {
  readonly at: string;
}

// Selo "Revisada" (etapa #644, CP3): a marca de uma mudança que o agente trocou ou
// acrescentou numa revisão e que ainda não tem decisão. Na linha de um item ou imagem que a
// contém, o mesmo selo com a dica geral. A dica fica no Tooltip e o texto também vai para o
// leitor de tela, dentro do selo.

/** O que o selo diz: a mudança trocada, a nova na revisão ou um nível que contém uma delas. */
export type RevisedBadge =
  | { readonly kind: 'changed' | 'added'; readonly at: string }
  | { readonly kind: 'contains' };

/** O selo de uma mudança com marca à vista, ou `null`. */
export function changeBadge(
  p: Proposal,
  revisedIds: ReadonlySet<string>,
  changeId: string,
): RevisedBadge | null {
  if (!revisedIds.has(changeId)) return null;
  const mark: RevisionMark | null = revisionMark(p, changeId);
  return mark ? { kind: mark.kind, at: mark.at } : null;
}

/** O selo de uma imagem ou item: `contains` se alguma das mudanças dele tem marca à vista (a proposta não leva). */
export function levelBadge(
  level: string,
  revisedIds: ReadonlySet<string>,
  changeIds: readonly string[],
): RevisedBadge | null {
  if (level === 'proposal') return null;
  return changeIds.some((id) => revisedIds.has(id)) ? { kind: 'contains' } : null;
}

/** Texto da dica do selo. */
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

/** Texto do selo. */
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

/** "Revisada pelo agente em <data>: 1 trocada(s), 2 nova(s)" no cabeçalho da proposta. */
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
