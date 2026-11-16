import { useContext } from 'preact/hooks';
import { followReference, type AnnotationLocation } from '../store/ui';
import { EditorContext } from './EditorContext';

// Following a reference or a backlink (stage #883, PG3, decision 13): to another page it opens the
// read-only preview; to the open page (or without an editor) it runs the caller's `onGoToAnnotation`.

/** The function to call, in place of `onGoToAnnotation`, where a `ref` or a backlink is followed. */
export function useFollowRef(
  onGoToAnnotation: (annotation: AnnotationLocation) => void,
): (annotation: AnnotationLocation) => void {
  const editor = useContext(EditorContext);
  return (annotation) => {
    const project = editor?.store.committed.peek() ?? null;
    if (!editor || !project) {
      onGoToAnnotation(annotation);
      return;
    }
    followReference(
      editor.ui,
      project,
      editor.session.page.openId(),
      annotation,
      onGoToAnnotation,
      focusedOpener(),
    );
  };
}

/**
 * The element that returns focus when the preview closes: the focused one, never the document
 * (in Safari a mouse click does not focus the button, so the body would be the "opener").
 */
function focusedOpener(): HTMLElement | null {
  const active = document.activeElement;
  if (!(active instanceof HTMLElement)) return null;
  return active === document.body || active === document.documentElement ? null : active;
}
