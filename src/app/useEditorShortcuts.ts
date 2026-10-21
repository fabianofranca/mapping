import { useEffect, useRef } from 'preact/hooks';
import { modalOpen } from '../ui/focus';
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
import { resolveSelection, setCleanView, type Selection } from '../store/ui';
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
import { arrangeMarking, canArrangeMarking } from '../ui/arrange';
import {
  canCopyItems,
  canCopyCrop,
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
  const el = document.activeElement?.closest('[data-window]');
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
    const column = el.closest('[data-tool-column]')?.getBoundingClientRect().height || 0;
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
 * `enabled` falso (janela estreita, com o editor atrás do aviso) desliga todos.
 */
export function useEditorShortcuts(
  dialogs: EditorDialogs,
  commands: ProjectCommands,
  enabled = true,
): void {
  const editor = useEditor();
  const { store, ui, canvas, actions, review } = editor;
  // O projeto à vista (`shownProject`): na visão Proposto da revisão, o item que só existe
  // na proposta também tem pai e filhos para o Alt+↑/↓ (fase 8.2, P1). Fora da revisão é
  // o confirmado; a prévia do gesto só muda geometria, que nenhum atalho daqui consulta.
  const shown = review.derived.shownProject;
  // Revisão: decidir e aplicar avisam os erros como os botões.
  const decide = useDecide();
  const apply = useApplyAccepted();
  const reviewRef = useRef({ decide, apply });
  reviewRef.current = { decide, apply };
  const dialogsRef = useRef(dialogs);
  dialogsRef.current = dialogs;
  const commandsRef = useRef(commands);
  commandsRef.current = commands;
  const enabledRef = useRef(enabled);
  enabledRef.current = enabled;

  useEffect(() => {
    const altNumbers = altNumbersAvailable(
      globalThis.navigator?.userAgent ?? '',
      isStandalone(),
    );

    /** Alt+↑ / Alt+↓: anda no caminho da seleção (B11). */
    const moveSelection = (up: boolean) => {
      const project = shown.peek();
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
      canvas.current?.centerSelection();
    };

    /**
     * Item que Ctrl+C / Ctrl+Alt+C copiariam agora, ou `null` quando o copiar fica com o
     * navegador: projeto fora de uma pasta, nada selecionado, ou texto selecionado na página.
     */
    const copyTarget = (shortcut: Shortcut): CopyTarget | null => {
      if (!canCopyItems(editor)) return null;
      if (shortcut.kind === 'copy-crop') {
        const target = copyShortcutTarget(editor);
        // Tela em branco não tem recorte: o atalho não assume a tecla.
        return target?.kind === 'm' && canCopyCrop(shown.peek(), target.id)
          ? target
          : null;
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
        case 'arrange': {
          // Container em linha ou coluna com filhas; fora disso (ou somente leitura) o atalho não age.
          if (store.locked.peek()) return;
          const current = resolveSelection(shown.peek(), ui.selection.peek());
          if (
            current?.kind === 'marking' &&
            canArrangeMarking(editor, current.marking.id)
          ) {
            arrangeMarking(editor, current.marking.id);
          }
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
          const current = resolveSelection(shown.peek(), ui.selection.peek());
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
          const current = resolveSelection(shown.peek(), ui.selection.peek());
          if (current?.kind === 'image') {
            actions.setImageLocked(current.image.id, !current.image.locked);
          } else if (current?.kind === 'marking') {
            actions.setMarkingLocked(current.marking.id, !current.marking.locked);
          }
          return;
        }
        case 'clean-view':
          return setCleanView(ui, !ui.cleanView.peek());
        case 'hide-window': {
          const focused = focusedWindow();
          if (focused) hideToolWindow(focused.id);
          return;
        }
        case 'toggle-window': {
          const { window } = shortcut;
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
          return showAndFocusToolWindow('layers');
        case 'help':
          return dialogsRef.current.show({ kind: 'help' });
        case 'settings':
          return dialogsRef.current.show({ kind: 'settings' });
        case 'new-annotation': {
          // O botão "+ Anotação" de Detalhes sabe a camada ativa, o tipo e o modo
          // somente leitura: o atalho só o aciona (abrindo Detalhes, se recolhido).
          const button = () =>
            // Exceção nominal (etapa 8, 8.3): o atalho aciona o "+ Anotação" de Detalhes, que
            // sabe a camada, o tipo e o somente leitura; trocar por um comando fica para depois.
            // eslint-disable-next-line no-restricted-syntax
            document.querySelector<HTMLButtonElement>(
              `[data-action="${ADD_ANNOTATION_ACTION}"]`,
            );
          if (button()) return button()?.click();
          if (resolveSelection(shown.peek(), ui.selection.peek())?.kind !== 'marking')
            return;
          showToolWindow('details');
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
            canvas.current?.centerSelection();
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
      if (e.defaultPrevented || !enabledRef.current) return;
      if (modalOpen.peek() > 0) return;
      if (review.proposalId.peek() !== null && !isTextInput(e.target)) {
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
  }, [editor, store, ui, canvas, actions, review, shown]);
}
