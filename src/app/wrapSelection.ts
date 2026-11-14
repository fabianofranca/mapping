// "What to wrap now" and the Wrap itself, in one place: the multiple-selection summary
// button, the Ctrl/Cmd+G shortcut and the menus (canvas and Tree) call these functions. The rule
// of how to wrap is only the model's `wrapItems` (docs/ARCHITECTURE.md, "Parent marking").
import { t } from '../i18n';
import { canWrapItems, type ItemRef, type Project } from '../model';
import {
  existingItems,
  isItemSelected,
  selectItems,
  selectedItems,
  showToast,
} from '../store/ui';
import type { EditorContextValue } from '../ui/EditorContext';

type WrapEditor = Pick<EditorContextValue, 'ui' | 'store' | 'review' | 'actions'>;

/**
 * Items that Wrap would take now: the current selection; or, in a menu opened on a row
 * (`row`) outside the selection, only that item. Only those that exist in the project.
 */
export function itemsToWrap(
  project: Project | null,
  selection: readonly ItemRef[],
  row?: ItemRef,
): readonly ItemRef[] {
  const items = row && !isItemSelected(selection, row) ? [row] : selection;
  return existingItems(project, items);
}

/** Wrap exists (it is not read-only nor the proposal review). */
export function wrapAvailable(editor: Pick<WrapEditor, 'store' | 'review'>): boolean {
  return !editor.store.locked.value && editor.review.proposalId.value === null;
}

/** The items of `itemsToWrap` from the editor's current state (subscribes to the signals, if read in a render). */
export function currentWrapItems(editor: WrapEditor, row?: ItemRef): readonly ItemRef[] {
  const project = editor.review.derived.shownProject.value;
  return itemsToWrap(project, selectedItems(editor.ui), row);
}

/** Some item of `items` enters a parent marking (notes and arrows do not). */
export function canWrapNow(editor: WrapEditor, items: readonly ItemRef[]): boolean {
  const project = editor.review.derived.shownProject.value;
  return wrapAvailable(editor) && project !== null && canWrapItems(project, items);
}

/**
 * Wraps `items` (one undo entry), leaves the new marking selected and, if the model
 * refuses, notifies through `multi.wrapFailed`. Returns whether it wrapped.
 */
export function wrapItemsNow(editor: WrapEditor, items: readonly ItemRef[]): boolean {
  const result = editor.actions.wrapItems(items);
  if (result.ok) {
    selectItems(editor.ui, [{ kind: 'marking', id: result.value }]);
    return true;
  }
  showToast(editor.ui, t('multi.wrapFailed'));
  return false;
}
