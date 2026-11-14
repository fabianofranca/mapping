import { t } from '../../i18n';
import type { ReviewTarget } from '../../model';
import type { DecisionResult } from '../../store/proposalActions';
import { showToast } from '../../store/ui';
import { useEditor } from '../EditorContext';
import type { ReviewNames } from './changeText';
import type { DecisionValue } from './DecisionControl';
import { useReviewCommands } from './useReviewCommands';
import { openToolWindow } from '../toolWindowLayout';

// Hooks shared by the review components: the names (current project + "how it would look"),
// deciding with the error notice, and navigating (selecting and showing on the canvas).

/** Current project, "how it would look" and the open proposal; `null` outside the review. */
export function useReviewNames(): ReviewNames | null {
  const { store, review } = useEditor();
  const proposal = review.derived.proposal.value;
  const current = store.committed.value;
  if (!proposal || !current) return null;
  return { current, preview: review.derived.preview.value?.project ?? null, proposal };
}

/** Decides a target and notifies if the decision was refused (e.g. the proposal is no longer open). */
export function useDecide(): (target: ReviewTarget, state: DecisionValue) => void {
  const { review } = useEditor();
  const { report } = useReviewCommands();
  return (target, state) => {
    void review.decide(target, state).then((result: DecisionResult) => {
      if (!result.ok) report(result.error);
    });
  };
}

/** Decides several changes in a single decision (one "Undo"); an error is reported once. */
export function useDecideMany(): (
  ids: readonly string[],
  state: 'accepted' | 'rejected',
) => void {
  const { review } = useEditor();
  const { report } = useReviewCommands();
  return (ids, state) => {
    const targets = ids.map((id): ReviewTarget => ({ level: 'change', id }));
    void review.decideMany(targets, state).then((result) => {
      if (result && !result.ok) report(result.error);
    });
  };
}

/**
 * Selects a review level and shows it on the canvas (the canvas selection follows the
 * review's through `useReviewSync`). `center` centers the view.
 */
export function useReviewNavigate(): (target: ReviewTarget, center?: boolean) => void {
  const { review, canvas } = useEditor();
  return (target, center = true) => {
    review.select(target);
    if (center) canvas.current?.centerSelection();
  };
}

/** Message of the batch that was just decided (the notice with "Undo"). */
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

/** Leads to the problem that blocks "Apply": selects the first change involved. */
export function useShowProblem(): () => void {
  const { review, canvas } = useEditor();
  return () => {
    const invalid = review.derived.invalid.peek().changeIds;
    const first = review.derived.proposal.peek()?.changes.find((c) => invalid.has(c.id));
    if (!first) return;
    review.select({ level: 'change', id: first.id });
    openToolWindow('proposals');
    openToolWindow('details');
    canvas.current?.centerSelection();
  };
}

/** "Accept all" / "Reject all" (the visible ones, with active filters). */
export function useDecideVisible(): (state: 'accepted' | 'rejected') => void {
  const { review } = useEditor();
  const { report } = useReviewCommands();
  return (state) => {
    void review.decideVisible(state).then((result) => {
      if (result && !result.ok) report(result.error);
    });
  };
}

/** "Apply accepted": one undo entry; when blocked, leads to the problem. */
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
