import { revealTarget, type RevealTarget } from '../store/reveal';
import { goToAnnotation, type AnnotationLocation } from '../store/ui';
import type { EditorContextValue } from './EditorContext';

// Going to an item that may be on another page (stage #883, PG2, decision 12). Every entry point
// that goes to an item opens what is needed first (`revealTarget`: the page of the item and, if the
// open perspective does not show it there, the Completa), then selects it and, if something had
// to open, frames it on the page that is now in view.

/**
 * Reveals what `target` points at, runs `select` (which reads the project in view again: it now
 * has the item) and frames the selection when the page or the perspective changed.
 */
export function navigateTo(
  editor: EditorContextValue,
  target: RevealTarget,
  select: () => void,
): void {
  const outcome = revealTarget(editor.session, target);
  select();
  if (outcome.pageChanged || outcome.perspectiveChanged) {
    editor.canvas.current?.centerSelection();
  }
}

/**
 * Backlinks, references, "Go to target", linked and Incomplete: goes to an annotation of any
 * marking or arrow of the project, on whatever page it is, selects its owner and frames it.
 */
export function goToAnnotationOnAnyPage(
  editor: EditorContextValue,
  annotation: AnnotationLocation,
): void {
  const selection = editor.ui.selection.peek();
  // The owner is a marking or an arrow (v13): `goToAnnotation` chooses by project.
  const sameItem =
    (selection?.kind === 'marking' || selection?.kind === 'arrow') &&
    selection.id === annotation.markingId;
  const outcome = revealTarget(editor.session, {
    kind: 'annotation',
    id: annotation.id,
  });
  goToAnnotation(
    editor.ui,
    annotation,
    null,
    editor.store.committed.peek(),
    editor.layers.show,
  );
  if (!sameItem || outcome.pageChanged || outcome.perspectiveChanged) {
    editor.canvas.current?.centerSelection();
  }
}
