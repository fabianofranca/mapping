import type { Project } from '../model';
import type { ReviewState } from './review';
import { resolveSelection, type ResolvedSelection, type Selection } from './ui';

// The selection resolved against the project in view (`review.derived.shownProject`): in
// the review's Proposed view, the item of a rejected creation is no longer in the "how it
// would look", but is still selected (the Details show it with "The creation was
// rejected"); the breadcrumb, the status bar and the cleanup after reloading then resolve
// it by the "how it would look" without the decisions. In the Current view and outside the
// review, only the project in view (the creation does not exist there yet: "Nothing
// selected").

type ReviewSource = Pick<ReviewState, 'derived' | 'view' | 'proposalId'>;

/** The project in which the selection exists (the one in view; otherwise, the preview without
 * decisions); `null` if in none. */
export function selectionProject(
  review: ReviewSource,
  selection: Selection,
  peek = false,
): Project | null {
  const d = review.derived;
  const shown = peek ? d.shownProject.peek() : d.shownProject.value;
  if (resolveSelection(shown, selection)) return shown;
  const reviewing = peek ? review.proposalId.peek() : review.proposalId.value;
  const view = peek ? review.view.peek() : review.view.value;
  if (reviewing === null || view !== 'proposed') return null;
  const full = peek ? d.fullPreview.peek() : d.fullPreview.value;
  return resolveSelection(full, selection) ? full : null;
}

/** The selection resolved by the project in view, with the preview without decisions in the
 * Proposed view. */
export function resolveShownSelection(
  review: ReviewSource,
  selection: Selection,
  peek = false,
): ResolvedSelection {
  return resolveSelection(selectionProject(review, selection, peek), selection);
}
