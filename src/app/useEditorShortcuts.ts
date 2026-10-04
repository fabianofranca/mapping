import { useEffect, useRef } from 'preact/hooks';
import { projectIndex } from '../model';
import {
  RESIZE_STEP,
  TOOL_WINDOWS,
  WINDOW_SIDE,
  hideToolWindow,
  resizeToolWindow,
  showToolWindow,
  toggleToolWindow,
  toolWindowSizes,
  type ToolWindowId,
  type ToolWindowSide,
} from '../store/toolWindows';
import { resolveSelection, type Selection } from '../store/ui';
import { useEditor } from '../ui/EditorContext';
import { spaceFor } from '../ui/toolWindowLayout';
import { isStandalone } from '../utils/platform';
import type { EditorDialogs } from './useEditorDialogs';
import type { ProjectCommands } from './useProjectCommands';
import {
  altNumbersAvailable,
  isTextInput,
  shortcutFor,
  type Shortcut,
} from './shortcuts';

interface FocusedWindow {
  readonly id: ToolWindowId;
  readonly side: ToolWindowSide;
  readonly el: Element;
}

/** Janela de ferramenta que contém o foco (ou `null` fora delas). */
function focusedWindow(): FocusedWindow | null {
  const el = document.activeElement?.closest('.tool-window');
  const name = el?.getAttribute('data-window');
  const id = TOOL_WINDOWS.find((candidate) => candidate === name);
  return el && id ? { id, side: WINDOW_SIDE[id], el } : null;
}

/** Redimensiona a janela em foco em 16px no sentido das setas (B2). */
function resizeFocused(dx: number, dy: number): void {
  const focused = focusedWindow();
  if (!focused) return;
  const { side, el } = focused;
  const delta = side === 'bottom' ? -dy : side === 'left' ? dx : -dx;
  if (delta === 0) return;
  const size = toolWindowSizes.peek()[side];
  resizeToolWindow(side, size + delta * RESIZE_STEP, spaceFor(el, side));
}

/**
 * Atalhos de teclado. Diálogos abertos cuidam do próprio teclado (Esc).
 * O listener é inscrito uma vez; `dialogs` aponta para a versão atual.
 */
export function useEditorShortcuts(
  dialogs: EditorDialogs,
  commands: ProjectCommands,
): void {
  const { store, ui, canvas } = useEditor();
  const dialogsRef = useRef(dialogs);
  dialogsRef.current = dialogs;
  const commandsRef = useRef(commands);
  commandsRef.current = commands;

  useEffect(() => {
    const altNumbers = altNumbersAvailable(
      globalThis.navigator?.userAgent ?? '',
      isStandalone(),
    );

    /** Alt+↑ / Alt+↓: anda no caminho da seleção (B11). */
    const moveSelection = (up: boolean) => {
      const project = store.project.peek();
      const current = resolveSelection(project, ui.selection.peek());
      if (!project || !current) return;
      const index = projectIndex(project);
      let next: Selection = null;
      if (current.kind === 'marking') {
        const { parentId, imageId, id } = current.marking;
        if (up) {
          next =
            parentId === null
              ? { kind: 'image', id: imageId }
              : { kind: 'marking', id: parentId };
        } else {
          const child = index.children.get(id)?.[0];
          next = child ? { kind: 'marking', id: child.id } : null;
        }
      } else if (!up) {
        const first = index.children
          .get(null)
          ?.find((m) => m.imageId === current.image.id);
        next = first ? { kind: 'marking', id: first.id } : null;
      }
      if (!next) return;
      ui.selection.value = next;
      canvas.current?.focusSelection();
    };

    const run = (shortcut: Shortcut) => {
      switch (shortcut.kind) {
        case 'undo':
          return store.undo();
        case 'redo':
          return store.redo();
        case 'escape':
          if (!canvas.current?.cancelInteraction()) ui.selection.value = null;
          return;
        case 'delete': {
          if (store.readOnly.peek()) return;
          const current = resolveSelection(store.project.peek(), ui.selection.peek());
          if (current?.kind === 'image') {
            dialogsRef.current.requestDeleteImage(current.image);
          } else if (current?.kind === 'marking') {
            dialogsRef.current.requestDeleteMarking(current.marking);
          }
          return;
        }
        case 'hide-window': {
          const focused = focusedWindow();
          if (focused) hideToolWindow(focused.id);
          return;
        }
        case 'toggle-window': {
          const { window } = shortcut;
          // Fechada ou sem foco dentro: abre e foca; já em foco: esconde.
          if (focusedWindow()?.id === window) toggleToolWindow(window);
          else showToolWindow(window);
          queueMicrotask(() => {
            document
              .querySelector<HTMLElement>(`.tool-window[data-window="${window}"]`)
              ?.focus();
          });
          return;
        }
        case 'resize-window':
          return resizeFocused(shortcut.dx, shortcut.dy);
        case 'select-parent':
          return moveSelection(true);
        case 'select-child':
          return moveSelection(false);
        case 'zoom':
          return canvas.current?.zoomBy(shortcut.factor);
        case 'zoom-reset':
          return canvas.current?.zoomTo(1);
        case 'export':
          return void commandsRef.current.exportProject();
        case 'layers':
          return dialogsRef.current.show({ kind: 'layers' });
        case 'help':
          return dialogsRef.current.show({ kind: 'help' });
        case 'settings':
          return dialogsRef.current.show({ kind: 'settings' });
      }
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.defaultPrevented || isTextInput(e.target)) return;
      if (document.querySelector('dialog[open]')) return;
      const shortcut = shortcutFor(e, altNumbers);
      if (!shortcut) return;
      e.preventDefault();
      run(shortcut);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [store, ui, canvas]);
}
