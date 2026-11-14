import { effect } from '@preact/signals';
import { useEffect } from 'preact/hooks';
import { projectIndex, type ReviewTarget, type ReviewTree } from '../model';
import { setReviewLayout } from '../store/toolWindows';
import { resolveSelection, type Selection } from '../store/ui';
import { useEditor } from '../ui/EditorContext';
import { canvasSelectionOf } from '../ui/review/canvasSelection';

// Connects the review to the rest of the editor: the bottom window layout (review height), the
// Browse mode (Draw does not exist in read-only) and the selection in both directions —
// choosing a level in the Proposals window selects the item on the canvas, and tapping an item on
// the canvas (or in the Tree) selects its level in the review.

const sameSelection = (a: Selection | undefined, b: Selection | undefined) =>
  a === b || (!!a && !!b && a.kind === b.kind && a.id === b.id);

/** Review level of an item selected on the canvas (the item or the image with changes). */
export function reviewTargetOf(
  tree: ReviewTree | null,
  selection: Selection,
): ReviewTarget | null {
  if (!tree || !selection) return null;
  if (selection.kind === 'image') {
    return tree.nodes.has(`image:${selection.id}`)
      ? { level: 'image', id: selection.id }
      : null;
  }
  return tree.nodes.has(`item:${selection.id}`)
    ? { level: 'item', id: selection.id }
    : null;
}

export function useReviewSync(): void {
  const { review, ui } = useEditor();

  useEffect(
    () =>
      effect(() => {
        const open = review.proposalId.value !== null;
        setReviewLayout(open);
        if (open && ui.mode.peek() === 'draw') ui.mode.value = 'navigate';
      }),
    [review, ui],
  );

  // Review → canvas.
  useEffect(
    () =>
      effect(() => {
        const target = review.selected.value;
        if (review.proposalId.value === null) return;
        const next = canvasSelectionOf(review, target);
        if (next !== undefined && !sameSelection(next, ui.selection.peek())) {
          ui.selection.value = next;
        }
      }),
    [review, ui],
  );

  // Canvas (or Tree) → review. Clearing the selection (clicking the background) takes the review off the item
  // or its change: the Details follow the selection and, without it, show the proposal (the status
  // bar says "Nothing selected"). Only the transition counts, not the empty selection from when the
  // review opens at a saved point.
  useEffect(() => {
    let before = ui.selection.peek();
    return effect(() => {
      const selection = ui.selection.value;
      const cleared = before !== null && selection === null;
      before = selection;
      if (review.proposalId.peek() === null) return;
      const current = review.selected.peek();
      if (selection === null) {
        if (cleared && canvasSelectionOf(review, current) !== undefined) {
          review.select({ level: 'proposal', id: null });
        }
        return;
      }
      // The canvas selection is already that of the chosen level (e.g. one of the item's changes).
      if (sameSelection(canvasSelectionOf(review, current), selection)) return;
      const target = reviewTargetOf(review.derived.tree.peek(), selection);
      if (target) review.select(target);
    });
  }, [review, ui]);

  // When leaving the review, an item that only existed in the "how it would look" is no longer selected
  // (outside the review the project in view is the committed one).
  useEffect(
    () =>
      effect(() => {
        if (review.proposalId.value !== null) return;
        const selection = ui.selection.peek();
        const project = review.derived.shownProject.peek();
        if (selection && !resolveSelection(project, selection)) {
          const exists =
            project &&
            (selection.kind === 'image'
              ? projectIndex(project).containers.has(selection.id)
              : selection.kind === 'arrow'
                ? projectIndex(project).arrows.has(selection.id)
                : projectIndex(project).markings.has(selection.id));
          if (!exists) ui.selection.value = null;
        }
      }),
    [review, ui],
  );
}
