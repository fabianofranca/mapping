import { t } from '../i18n';
import { canArrange, canFit, projectIndex, type Project } from '../model';
import { showToast } from '../store/ui';
import type { EditorContextValue } from './EditorContext';
import { markingErrorMessage } from './labels';
import { messageText } from './modelMessage';

// "Arrange" (Library stage, B3): the Details button, the canvas menu item and the
// shortcut call the same path, which shows the result in a short notice.

/** The marking has an anchor: Arrange also snaps it (R4, decision 12). */
function isAnchored(project: Project, markingId: string): boolean {
  return projectIndex(project).anchorOf.has(markingId);
}

/**
 * Arrange applies to the marking (in the project in view and in the current catalog): a container with children
 * that is arranged, a component without a slot with an axis that depends on the content, which fits to it, or
 * any marking with an anchor, which snaps to it.
 */
export function canArrangeMarking(
  editor: EditorContextValue,
  markingId: string,
): boolean {
  const project = editor.review.derived.shownProject.value;
  if (project === null) return false;
  const catalog = editor.derived.catalog.value;
  return (
    canArrange(project, catalog, markingId) ||
    canFit(project, catalog, markingId) ||
    isAnchored(project, markingId)
  );
}

/**
 * The button's tooltip: arrange the inner ones (container with children), fit to the content or, on a
 * marking that only has an anchor, snap to it.
 */
export function arrangeHintKey(
  editor: EditorContextValue,
  markingId: string,
): 'arrange.hint' | 'arrange.hintFit' | 'arrange.hintAnchor' {
  const project = editor.review.derived.shownProject.value;
  if (project === null) return 'arrange.hintFit';
  const catalog = editor.derived.catalog.value;
  if (canArrange(project, catalog, markingId)) return 'arrange.hint';
  if (canFit(project, catalog, markingId)) return 'arrange.hintFit';
  return isAnchored(project, markingId) ? 'arrange.hintAnchor' : 'arrange.hintFit';
}

/** Arranges the marking and notifies: "Arranged", "Arranged with N warnings: …" or "Nothing to arrange". */
export function arrangeMarking(editor: EditorContextValue, markingId: string): void {
  const { actions, review, ui } = editor;
  const before = review.derived.shownProject.peek();
  const result = actions.arrange(markingId);
  if (!result.ok) {
    showToast(ui, markingErrorMessage(result.error));
    return;
  }
  const warnings = result.value;
  const changed = review.derived.shownProject.peek() !== before;
  const [first] = warnings;
  if (first !== undefined) {
    showToast(
      ui,
      t('arrange.doneWarnings', { count: warnings.length, first: messageText(first) }),
    );
  } else {
    showToast(ui, t(changed ? 'arrange.done' : 'arrange.nothing'));
  }
}

/** "Snap to anchor": snaps the marking and notifies: "Snapped", with warnings, or "Already snapped". */
export function snapMarking(editor: EditorContextValue, markingId: string): void {
  const { actions, review, ui } = editor;
  const before = review.derived.shownProject.peek();
  const result = actions.snapToAnchor(markingId);
  if (!result.ok) {
    showToast(ui, markingErrorMessage(result.error));
    return;
  }
  const [first] = result.value;
  if (first !== undefined) {
    showToast(
      ui,
      t('anchor.snappedWarnings', {
        count: result.value.length,
        first: messageText(first),
      }),
    );
    return;
  }
  const changed = review.derived.shownProject.peek() !== before;
  showToast(ui, t(changed ? 'anchor.snapped' : 'anchor.snapNothing'));
}
