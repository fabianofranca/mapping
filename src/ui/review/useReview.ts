import { t } from '../../i18n';
import type { ReviewTarget } from '../../model';
import type { DecisionResult } from '../../store/proposalActions';
import { showToast } from '../../store/ui';
import { useEditor } from '../EditorContext';
import type { ReviewNames } from './changeText';
import type { DecisionValue } from './DecisionControl';
import { useReviewCommands } from './useReviewCommands';
import { showToolWindow } from '../../store/toolWindows';
import { DESKTOP_QUERY } from '../../theme/breakpoints';
import { useMediaQuery } from '../useMediaQuery';

// Ganchos comuns aos componentes da revisão: os nomes (projeto atual + "como ficaria"),
// decidir com o aviso de erro, e navegar (selecionar e mostrar no canvas).

/** Projeto atual, "como ficaria" e a proposta aberta; `null` fora da revisão. */
export function useReviewNames(): ReviewNames | null {
  const { store, review } = useEditor();
  const proposal = review.derived.proposal.value;
  const current = store.committed.value;
  if (!proposal || !current) return null;
  return { current, preview: review.derived.preview.value?.project ?? null, proposal };
}

/** Decide um alvo e avisa se a decisão foi recusada (ex.: a proposta não está mais aberta). */
export function useDecide(): (target: ReviewTarget, state: DecisionValue) => void {
  const { review } = useEditor();
  const { report } = useReviewCommands();
  return (target, state) => {
    void review.decide(target, state).then((result: DecisionResult) => {
      if (!result.ok) report(result.error);
    });
  };
}

/**
 * Seleciona um nível da revisão e o mostra no canvas (a seleção do canvas acompanha a da
 * revisão por `useReviewSync`). `center` centraliza a vista.
 */
export function useReviewNavigate(): (target: ReviewTarget, center?: boolean) => void {
  const { review, canvas } = useEditor();
  return (target, center = true) => {
    review.select(target);
    if (center) canvas.current?.focusSelection();
  };
}

/** Mensagem do lote que acabou de ser decidido (o aviso com "Desfazer"). */
export function undoMessage(
  changed: number,
  cascaded: number,
  state: DecisionValue,
): string {
  const key =
    state === 'accepted'
      ? 'review.undo.accepted'
      : state === 'rejected'
        ? 'review.undo.rejected'
        : 'review.undo.cleared';
  const main = t(key, { count: changed });
  return cascaded > 0
    ? `${main} ${t('review.undo.cascaded', { count: cascaded })}`
    : main;
}

/** Leva ao problema que bloqueia "Aplicar": seleciona a primeira mudança envolvida. */
export function useShowProblem(): () => void {
  const { review, canvas } = useEditor();
  const desktop = useMediaQuery(DESKTOP_QUERY);
  return () => {
    const invalid = review.derived.invalid.peek().changeIds;
    const first = review.derived.proposal.peek()?.changes.find((c) => invalid.has(c.id));
    if (!first) return;
    review.select({ level: 'change', id: first.id });
    if (desktop) {
      showToolWindow('proposals');
      showToolWindow('details');
    }
    canvas.current?.focusSelection();
  };
}

/** "Aceitar tudo" / "Rejeitar tudo" (as visíveis, com filtros ativos). */
export function useDecideVisible(): (state: 'accepted' | 'rejected') => void {
  const { review } = useEditor();
  const { report } = useReviewCommands();
  return (state) => {
    void review.decideVisible(state).then((result) => {
      if (result && !result.ok) report(result.error);
    });
  };
}

/** "Aplicar aceitas": uma entrada de desfazer; bloqueado, leva ao problema. */
export function useApplyAccepted(): () => Promise<boolean> {
  const { review, ui } = useEditor();
  const { report } = useReviewCommands();
  const showProblem = useShowProblem();
  return async () => {
    if (!review.derived.canApply.peek()) {
      if (review.derived.validation.peek()?.ok === false) {
        report('blocked');
        showProblem();
      }
      return false;
    }
    const result = await review.apply();
    if (!result) return false;
    if (!result.ok) {
      report(result.error, result.path);
      if (result.error === 'blocked') showProblem();
      return false;
    }
    showToast(ui, t('review.applied', { count: result.applied }));
    return true;
  };
}
