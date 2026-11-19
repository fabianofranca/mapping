import { t } from '../i18n';
import { projectIndex, type Page, type PageAnchorCrossing, type Project } from '../model';
import { showToast } from '../store/ui';
import type { EditorContextValue } from './EditorContext';
import { navigateTo } from './pageNavigation';

// "Move to page" from the interface (stage #883, PG2, decision 11), shared by the right-click menu and
// the Details of a root: which of the selected items are roots, which pages are the destinations,
// the call to the store action with the refusal handling, and "Go to the arrow" of the refusal.

/** The ids that are roots (a container with no parent, a canvas marking), in order; the rest drop out. */
export function movableRoots(
  project: Project,
  ids: readonly string[],
): readonly string[] {
  const { rootMembers } = projectIndex(project);
  return [...new Set(ids)].filter((id) => rootMembers.has(id));
}

/** The pages a root can go to: every page except the ones where ALL the roots already are. */
export function destinationPages(
  project: Project,
  roots: readonly string[],
): readonly Page[] {
  const { pageOf } = projectIndex(project);
  const pages = new Set(roots.map((id) => pageOf.get(id)));
  const single = pages.size === 1 ? [...pages][0] : undefined;
  return project.pages.filter((page) => page.id !== single);
}

/**
 * Takes the roots to the page. A refusal for crossing arrows or anchors asks the dialogs to list
 * them (`moveRefusal`); any other failure is a short notice. Success: the store already tells the "Moved
 * to" notice.
 */
export function moveRootsToPage(
  editor: EditorContextValue,
  roots: readonly string[],
  pageId: string,
): void {
  const result = editor.actions.moveRootsToPage(roots, pageId);
  if (result.ok) return;
  if ('arrows' in result) {
    editor.moveRefusal.value = { arrows: result.arrows, anchors: result.anchors, roots };
  } else {
    showToast(editor.ui, t('page.error.generic'));
  }
}

/** "Go to the arrow" of the refusal dialog: opens the arrow's page, selects the arrow and frames it. */
export function goToArrow(editor: EditorContextValue, arrowId: string): void {
  navigateTo(editor, { kind: 'arrow', id: arrowId }, () => {
    editor.ui.selection.value = { kind: 'arrow', id: arrowId };
  });
}

/**
 * The end of an anchor that stays outside the group being moved (the one to add to the selection or
 * to unanchor): the target when the anchored marking leaves, the anchored marking when the target does.
 */
export function anchorEndThatStays(
  project: Project,
  anchor: PageAnchorCrossing,
  roots: readonly string[],
): string {
  const { rootOf } = projectIndex(project);
  const moving = new Set(roots);
  const markingMoves = moving.has(rootOf.get(anchor.marking) ?? anchor.marking);
  return markingMoves ? anchor.to : anchor.marking;
}

/** "Go to the marking" of the refusal dialog: opens the end that stays, selects it and frames it. */
export function goToAnchorEnd(
  editor: EditorContextValue,
  anchor: PageAnchorCrossing,
  roots: readonly string[],
): void {
  const project = editor.store.committed.peek();
  if (!project) return;
  const id = anchorEndThatStays(project, anchor, roots);
  navigateTo(editor, { kind: 'marking', id }, () => {
    editor.ui.selection.value = { kind: 'marking', id };
  });
}
