import { useEffect, useRef } from 'preact/hooks';
import { projectIndex } from '../model';
import {
  RESIZE_STEP,
  TOOL_WINDOWS,
  WINDOW_SIDE,
  hideToolWindow,
  layersWindowHeight,
  resizeLayersWindow,
  resizeToolWindow,
  showToolWindow,
  toggleToolWindow,
  toolWindowSizes,
  type ToolWindowId,
  type ToolWindowSide,
} from '../store/toolWindows';
import { resolveSelection, type Selection } from '../store/ui';
import { useEditor } from '../ui/EditorContext';
import { showAndFocusToolWindow, spaceFor } from '../ui/toolWindowLayout';
import { isStandalone } from '../utils/platform';
import type { EditorDialogs } from './useEditorDialogs';
import type { ProjectCommands } from './useProjectCommands';
import {
  altNumbersAvailable,
  isTextInput,
  reviewShortcutFor,
  shortcutFor,
  worksInTextInput,
  type ReviewShortcut,
  type Shortcut,
} from './shortcuts';
import { useApplyAccepted, useDecide } from '../ui/review/useReview';
import { ADD_ANNOTATION_ACTION } from '../ui/AnnotationsPanel';
import {
  canCopyItems,
  copyCrop,
  copyReference,
  copyShortcutTarget,
  type CopyTarget,
} from './itemClipboard';

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

/**
 * Redimensiona a janela em foco em 16px no sentido das setas (B2). Nas Camadas
 * empilhadas, ↑/↓ mexem na divisória com a Árvore e ←/→ na largura da coluna.
 */
function resizeFocused(dx: number, dy: number): void {
  const focused = focusedWindow();
  if (!focused) return;
  const { id, side, el } = focused;
  if (id === 'layers' && dy !== 0 && el.classList.contains('tool-window-stacked')) {
    const column = el.closest('.tool-column')?.getBoundingClientRect().height || 0;
    resizeLayersWindow(layersWindowHeight.peek() - dy * RESIZE_STEP, column);
    return;
  }
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
  desktop = true,
): void {
  const editor = useEditor();
  const { store, ui, canvas, actions, review } = editor;
  // Revisão: decidir e aplicar avisam os erros como os botões.
  const decide = useDecide();
  const apply = useApplyAccepted();
  const reviewRef = useRef({ decide, apply });
  reviewRef.current = { decide, apply };
  const dialogsRef = useRef(dialogs);
  dialogsRef.current = dialogs;
  const commandsRef = useRef(commands);
  commandsRef.current = commands;
  // No desktop as janelas ficam encaixadas; no celular abrem em tela cheia (B6).
  const desktopRef = useRef(desktop);
  desktopRef.current = desktop;

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

    /**
     * Item que Ctrl+C / Ctrl+Alt+C copiariam agora, ou `null` quando o copiar fica com o
     * navegador: projeto fora de uma pasta, nada selecionado, ou texto selecionado na página.
     */
    const copyTarget = (shortcut: Shortcut): CopyTarget | null => {
      if (!canCopyItems(editor)) return null;
      if (shortcut.kind === 'copy-crop') {
        const target = copyShortcutTarget(editor);
        return target?.kind === 'm' ? target : null;
      }
      if (globalThis.getSelection?.()?.toString()) return null;
      return copyShortcutTarget(editor);
    };

    const run = (shortcut: Shortcut) => {
      switch (shortcut.kind) {
        case 'copy-reference': {
          const target = copyTarget(shortcut);
          if (target) void copyReference(editor, target);
          return;
        }
        case 'copy-crop': {
          const target = copyTarget(shortcut);
          if (target) void copyCrop(editor, target.id);
          return;
        }
        case 'undo':
          return store.undo();
        case 'redo':
          return store.redo();
        case 'escape':
          if (!canvas.current?.cancelInteraction()) ui.selection.value = null;
          return;
        case 'delete': {
          if (store.locked.peek()) return;
          const current = resolveSelection(store.project.peek(), ui.selection.peek());
          if (current?.kind === 'image') {
            dialogsRef.current.requestDeleteImage(current.image);
          } else if (current?.kind === 'marking') {
            dialogsRef.current.requestDeleteMarking(current.marking);
          }
          return;
        }
        case 'toggle-lock': {
          // Só a trava muda: seleção e anotações seguem livres, mas o somente leitura vale.
          if (store.locked.peek()) return;
          const current = resolveSelection(store.project.peek(), ui.selection.peek());
          if (current?.kind === 'image') {
            actions.setImageLocked(current.image.id, !current.image.locked);
          } else if (current?.kind === 'marking') {
            actions.setMarkingLocked(current.marking.id, !current.marking.locked);
          }
          return;
        }
        case 'hide-window': {
          if (!desktopRef.current) {
            ui.mobileWindow.value = null;
            return;
          }
          const focused = focusedWindow();
          if (focused) hideToolWindow(focused.id);
          return;
        }
        case 'toggle-window': {
          const { window } = shortcut;
          if (!desktopRef.current) {
            ui.mobileWindow.value = ui.mobileWindow.peek() === window ? null : window;
            return;
          }
          // Fechada ou sem foco dentro: abre e foca; já em foco: esconde.
          if (focusedWindow()?.id === window) toggleToolWindow(window);
          else showAndFocusToolWindow(window);
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
          if (desktopRef.current) return showAndFocusToolWindow('layers');
          ui.mobileWindow.value = 'layers';
          return;
        case 'help':
          return dialogsRef.current.show({ kind: 'help' });
        case 'settings':
          return dialogsRef.current.show({ kind: 'settings' });
        case 'new-annotation': {
          // O botão "+ Anotação" de Detalhes sabe a camada ativa, o tipo e o modo
          // somente leitura: o atalho só o aciona (abrindo Detalhes, se recolhido).
          const button = () =>
            document.querySelector<HTMLButtonElement>(
              `[data-action="${ADD_ANNOTATION_ACTION}"]`,
            );
          if (button()) return button()?.click();
          if (
            resolveSelection(store.project.peek(), ui.selection.peek())?.kind !==
            'marking'
          )
            return;
          // Celular: a gaveta abre (ela só monta Detalhes aberta).
          if (desktopRef.current) showToolWindow('details');
          else ui.sheet.value = 'open';
          requestAnimationFrame(() => button()?.click());
          return;
        }
      }
    };

    /** Atalhos da revisão (HANDOFF-PROPOSALS 6): agem sobre o nível selecionado. */
    const runReview = (shortcut: ReviewShortcut) => {
      switch (shortcut.kind) {
        case 'decide': {
          const target = review.selected.peek();
          if (target) reviewRef.current.decide(target, shortcut.state);
          return;
        }
        case 'step':
          if (review.step(shortcut.target, shortcut.direction)) {
            canvas.current?.focusSelection();
          }
          return;
        case 'toggle-view':
          review.setView(review.view.peek() === 'current' ? 'proposed' : 'current');
          return;
        case 'legend':
          ui.reviewLegend.value = !ui.reviewLegend.peek();
          return;
        case 'apply':
          void reviewRef.current.apply();
          return;
      }
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.defaultPrevented) return;
      if (document.querySelector('dialog[open]')) return;
      // No celular não há atalhos de revisão (as ações estão nos botões de 44px).
      if (
        review.proposalId.peek() !== null &&
        desktopRef.current &&
        !isTextInput(e.target)
      ) {
        const reviewShortcut = reviewShortcutFor(e);
        if (reviewShortcut) {
          e.preventDefault();
          runReview(reviewShortcut);
          return;
        }
      }
      const shortcut = shortcutFor(e, altNumbers);
      if (!shortcut) return;
      if (isTextInput(e.target) && !worksInTextInput(shortcut)) return;
      // Copiar: só assume o atalho com um item para copiar; senão o copiar nativo continua.
      if (
        (shortcut.kind === 'copy-reference' || shortcut.kind === 'copy-crop') &&
        !copyTarget(shortcut)
      ) {
        return;
      }
      e.preventDefault();
      run(shortcut);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [editor, store, ui, canvas, actions, review]);
}
