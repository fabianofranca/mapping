import type { ComponentChildren } from 'preact';
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
import { useApplyAccepted, useDecideVisible, useShowProblem } from './useReview';

// Faixa do modo revisão (HANDOFF-PROPOSALS 5.2, ReviewBar): selo REVISÃO, título,
// origem, progresso, contagens e as quatro ações (Rejeitar tudo, Aceitar tudo, Aplicar
// aceitas · N, o único primário, e Sair da revisão). Com filtros ativos, o lote vale só
// para o que a lista mostra. Abaixo de 1200px fica compacta (contagens só com ícone e o
// lote num menu "Em lote"); no celular é a faixa de duas linhas (`MobileReviewStrip`).

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

/** Rótulo do "Aplicar aceitas · N" e o motivo de estar desabilitado. */
export function useApplyState() {
  const { review, store } = useEditor();
  const d = review.derived;
  const counts = d.counts.value;
  const validation = d.validation.value;
  const canApply = d.canApply.value;
  const label = t('review.applyCount', { count: counts.acceptedPending });
  let reason: string | null = null;
  if (store.readOnly.value) reason = t('proposal.error.readOnly');
  else if (counts.acceptedPending === 0) reason = t('review.applyNone');
  else if (validation && !validation.ok) reason = t('review.applyBlocked');
  return {
    label,
    disabled: !canApply,
    tooltip: reason ?? t('review.applyTip'),
    blocked: validation !== null && !validation.ok,
    issues: validation?.issues.length ?? 0,
  };
}

export function ReviewBar({ onExit }: { readonly onExit: () => void }) {
  const { review } = useEditor();
  const compact = useMediaQuery(`(max-width: ${BREAKPOINTS.compact}px)`);
  const d = review.derived;
  const p = d.proposal.value;
  const decideVisible = useDecideVisible();
  const apply = useApplyAccepted();
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
    <MenuPopover label={t('review.bulk')} buttonLabel={t('review.bulkTitle')}>
      <Button disabled={bulkDisabled} onClick={() => decideVisible('accepted')}>
        <Icon name="check" />
        {acceptLabel}
      </Button>
      <Button disabled={bulkDisabled} onClick={() => decideVisible('rejected')}>
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
    <section class="review-bar" aria-label={t('review.region')}>
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
        {!compact && p.origin && (
          <span class="review-bar-origin" title={p.origin}>
            {p.origin}
          </span>
        )}
        <Flag icon="lock" title={t('review.readOnlyTip')}>
          {t('review.readOnlyFlag')}
        </Flag>
      </div>
      <div class="review-bar-stats">
        <ProgressBar summary={counts} />
        <Stat
          label={t('review.count.undecided')}
          value={counts.undecided}
          compact={compact}
        >
          <DecisionMark state="undecided" decorative />
        </Stat>
        <Stat
          label={t('review.count.accepted')}
          value={counts.accepted}
          compact={compact}
        >
          <DecisionMark state="accepted" decorative />
        </Stat>
        <Stat
          label={t('review.count.rejected')}
          value={counts.rejected}
          compact={compact}
        >
          <DecisionMark state="rejected" decorative />
        </Stat>
        {counts.conflicts > 0 && (
          <Stat
            label={t('review.count.conflicts')}
            value={counts.conflicts}
            compact={compact}
            warn
          >
            <Icon name="warning" />
          </Stat>
        )}
      </div>
      <div class="review-bar-actions">
        {applyState.blocked && (
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
          aria-keyshortcuts="Control+Enter"
          onClick={() => void apply()}
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

/**
 * Celular (`mp-mstrip`): selo e título numa linha; progresso e contagens na outra. Fica
 * entre a barra de cima e o canvas; as ações vão para a barra de baixo e o menu.
 */
export function MobileReviewStrip() {
  const { review } = useEditor();
  const p = review.derived.proposal.value;
  if (!p) return null;
  const counts = review.derived.counts.value;
  return (
    <section class="review-strip" aria-label={t('review.region')}>
      <div class="review-strip-top">
        <span class="review-badge">
          <Icon name="proposal" />
          {t('review.mode')}
        </span>
        <b title={p.title}>{p.title}</b>
      </div>
      <div class="review-strip-stats">
        <ProgressBar summary={counts} wide />
        <Stat label={t('review.count.undecided')} value={counts.undecided} compact>
          <DecisionMark state="undecided" decorative />
        </Stat>
        <Stat label={t('review.count.accepted')} value={counts.accepted} compact>
          <DecisionMark state="accepted" decorative />
        </Stat>
        <Stat label={t('review.count.rejected')} value={counts.rejected} compact>
          <DecisionMark state="rejected" decorative />
        </Stat>
        {counts.conflicts > 0 && (
          <Stat label={t('review.count.conflicts')} value={counts.conflicts} compact warn>
            <Icon name="warning" />
          </Stat>
        )}
      </div>
    </section>
  );
}
