import { useEffect, useRef } from 'preact/hooks';
import { resolveSelection } from '../store/ui';
import { useEditor } from '../ui/EditorContext';
import type { EditorDialogs } from './useEditorDialogs';
import { isTextInput, shortcutFor } from './shortcuts';

/**
 * Atalhos de teclado. Diálogos abertos cuidam do próprio teclado (Esc).
 * O listener é inscrito uma vez; `dialogs` aponta para a versão atual.
 */
export function useEditorShortcuts(dialogs: EditorDialogs): void {
  const { store, ui, canvas } = useEditor();
  const dialogsRef = useRef(dialogs);
  dialogsRef.current = dialogs;

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.defaultPrevented || isTextInput(e.target)) return;
      if (document.querySelector('dialog[open]')) return;
      const shortcut = shortcutFor(e);
      if (!shortcut) return;
      e.preventDefault();
      if (shortcut === 'undo') store.undo();
      if (shortcut === 'redo') store.redo();
      if (shortcut === 'escape' && !canvas.current?.cancelInteraction()) {
        ui.selection.value = null;
      }
      if (shortcut === 'delete' && !store.readOnly.peek()) {
        const current = resolveSelection(store.project.peek(), ui.selection.peek());
        if (current?.kind === 'image')
          dialogsRef.current.requestDeleteImage(current.image);
        if (current?.kind === 'marking') {
          dialogsRef.current.requestDeleteMarking(current.marking);
        }
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [store, ui, canvas]);
}
