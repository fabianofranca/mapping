import { t } from '../../i18n';
import { hasActiveFilters } from '../../model';
import { Button, IconButton } from '../controls';
import { Dialog } from '../Dialog';
import { useEditor } from '../EditorContext';
import { Icon } from '../icons';
import { DecisionControl } from './DecisionControl';
import { targetName } from './changeText';
import { ReviewFilters } from './ReviewLevels';
import { useApplyState } from './ReviewBar';
import { useApplyAccepted, useDecide, useReviewNames } from './useReview';

// Revisão no celular (HANDOFF-PROPOSALS 5.5): as mesmas funções do desktop em botões de
// 44px. A barra de baixo troca as ferramentas (somente leitura) por Painéis, Filtros,
// Próxima pendente e Aplicar aceitas · N; os filtros abrem em tela cheia; a gaveta mostra
// o nível selecionado com Aceitar e Rejeitar.

export function MobileReviewBottomBar({
  onPanels,
  onFilters,
}: {
  readonly onPanels: () => void;
  readonly onFilters: () => void;
}) {
  const { review, canvas } = useEditor();
  const apply = useApplyAccepted();
  const applyState = useApplyState();
  const filtered = hasActiveFilters(review.filters.value);
  return (
    <nav class="bottombar review-bottombar" aria-label={t('review.mobile.toolbar')}>
      <IconButton icon="panelLeft" label={t('panels.open')} onClick={onPanels} />
      <IconButton
        icon="filter"
        label={t('review.filters')}
        pressed={filtered}
        onClick={onFilters}
      />
      <IconButton
        icon="arrowDown"
        label={t('review.nextPending')}
        disabled={review.derived.pendingIds.value.length === 0}
        onClick={() => {
          if (review.step('pending', 1)) canvas.current?.focusSelection();
        }}
      />
      <Button
        variant="primary"
        class="review-bottombar-apply"
        disabled={applyState.disabled}
        title={applyState.tooltip}
        onClick={() => void apply()}
      >
        {applyState.label}
      </Button>
    </nav>
  );
}

/** Filtros da revisão em tela cheia (`BottomSheet` de 68% no desenho). */
export function ReviewFiltersDialog({ onClose }: { readonly onClose: () => void }) {
  const { review } = useEditor();
  const names = useReviewNames();
  if (!names) return null;
  const shown = review.derived.visibleIds.value.length;
  return (
    <Dialog
      title={t('review.filters')}
      onCancel={onClose}
      actions={
        <>
          <Button onClick={() => review.clearFilters()}>
            {t('review.filter.clear')}
          </Button>
          <Button variant="primary" onClick={onClose}>
            {t('review.filter.showCount', { count: shown })}
          </Button>
        </>
      }
    >
      <ReviewFilters names={names} stacked />
    </Dialog>
  );
}

/** Cabeçalho da gaveta na revisão: o nível selecionado com Aceitar e Rejeitar. */
export function ReviewSheetDecision() {
  const { review } = useEditor();
  const names = useReviewNames();
  const decide = useDecide();
  const target = review.selected.value;
  const p = review.derived.proposal.value;
  if (!names || !target || !p) return null;
  const key = `${target.level}:${target.id ?? ''}`;
  const state =
    target.level === 'change'
      ? (p.decisions[target.id ?? '']?.state ?? null)
      : review.derived.levels.value.get(key)?.state;
  return (
    <DecisionControl
      value={state === 'accepted' || state === 'rejected' ? state : null}
      name={targetName(names, target)}
      disabled={p.status !== 'open'}
      onDecide={(next) => decide(target, next)}
    />
  );
}

/** Título da gaveta na revisão. */
export function useReviewSheetTitle(): string | null {
  const { review } = useEditor();
  const names = useReviewNames();
  const target = review.selected.value;
  if (review.proposalId.value === null || !names) return null;
  return target ? targetName(names, target) : t('review.details.none');
}

/** Barra de cima na revisão: Sair (com a seta), o projeto e "Somente leitura". */
export function MobileReviewExit({ onExit }: { readonly onExit: () => void }) {
  return (
    <Button variant="ghost" class="review-mobile-exit" onClick={onExit}>
      <Icon name="arrowLeft" />
      {t('review.mobile.exit')}
    </Button>
  );
}
