import { useEffect, useRef } from 'preact/hooks';
import { NudgeSession } from './nudgeKeys';
import { modalOpen } from '../ui/focus';
import { projectIndex } from '../model';
import {
  RESIZE_STEP,
  TOOL_WINDOWS,
  WINDOW_SIDE,
  layersWindowHeight,
  resizeLayersWindow,
  resizeToolWindow,
  toolWindowSizes,
  type ToolWindowId,
  type ToolWindowSide,
} from '../store/toolWindows';
import {
  collapseToPrimary,
  existingItems,
  peekSelectedItems,
  resolveSelection,
  selectItems,
  setViewMode,
  type Selection,
} from '../store/ui';
import { useEditor } from '../ui/EditorContext';
import {
  closeToolWindow,
  showAndFocusToolWindow,
  spaceFor,
} from '../ui/toolWindowLayout';
import { isStandalone } from '../utils/platform';
import type { EditorDialogs } from './useEditorDialogs';
import type { ProjectCommands } from './useProjectCommands';
import {
  altNumbersAvailable,
  arrowsBelongToEditor,
  isTextInput,
  isTypingField,
  reviewShortcutFor,
  shortcutFor,
  type ReviewShortcut,
  type Shortcut,
} from './shortcuts';
import { useApplyAccepted, useDecide } from '../ui/review/useReview';
import { toggleReviewLegend } from '../ui/review/ReviewCanvasControls';
import { arrangeMarking, canArrangeMarking } from '../ui/arrange';
import { canWrapNow, currentWrapItems, wrapItemsNow } from './wrapSelection';
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
      // A seta não tem pai nem filhas a percorrer.
      if (current.kind === 'arrow') return;
      const index = projectIndex(project);
      let next: Selection = null;
      if (current.kind === 'marking') {
        const { parentId, containerId, id } = current.marking;
        if (up) {
          if (parentId !== null) next = { kind: 'marking', id: parentId };
          else if (containerId !== null) next = { kind: 'image', id: containerId };
        } else {
          const child = index.children.get(id)?.[0];
          const member = index.containersByParent.get(id)?.[0];
          if (child) next = { kind: 'marking', id: child.id };
          else if (member) next = { kind: 'image', id: member.id };
        }
      } else if (up) {
        // Container dentro de uma marcação do canvas: sobe para ela.
        if (current.image.parentId !== null) {
          next = { kind: 'marking', id: current.image.parentId };
        }
      } else {
        const first = index.children
          .get(null)
          ?.find((m) => m.containerId === current.image.id);
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
        // Container sem arquivo não tem recorte: o atalho não assume a tecla.
        return target?.kind === 'm' && canCopyCrop(shown.peek(), target.id)
          ? target
          : null;
      }
      if (globalThis.getSelection?.()?.toString()) return null;
      return copyShortcutTarget(editor);
    };

    /**
     * O atalho assume a tecla só quando tem o que fazer; senão o evento segue para o navegador
     * (copiar nativo, "localizar próximo"): copiar sem item para copiar; envolver sem nada que
     * entre numa marcação pai (somente leitura, revisão, sem seleção, só notas e setas).
     */
    const applies = (shortcut: Shortcut): boolean => {
      if (shortcut.kind === 'copy-reference' || shortcut.kind === 'copy-crop') {
        return copyTarget(shortcut) !== null;
      }
      if (shortcut.kind === 'wrap') return canWrapNow(editor, currentWrapItems(editor));
      return true;
    };

    /**
     * Envolver não age na tecla repetida (segurar o Ctrl+G aninharia um pai por repetição) nem
     * com um gesto de ponteiro em andamento (o store recusaria e o aviso apareceria no meio do
     * arrasto). O `preventDefault` já foi chamado: o "localizar próximo" do navegador fica fora.
     */
    const wrapIgnored = (shortcut: Shortcut, e: KeyboardEvent): boolean =>
      shortcut.kind === 'wrap' && (e.repeat || canvas.current?.isInteracting() === true);

    const run = (shortcut: Shortcut) => {
      switch (shortcut.kind) {
        case 'wrap':
          return void wrapItemsNow(editor, currentWrapItems(editor));
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
          // Gesto em andamento: cancela. Senão, com vários itens volta ao primário; por fim limpa.
          if (canvas.current?.cancelInteraction()) return;
          // No modo visualização o Esc sai do modo (o painel aberto já consumiu o Esc dele).
          if (ui.viewMode.peek()) return setViewMode(ui, false);
          if (!collapseToPrimary(ui)) selectItems(ui, []);
          return;
        case 'delete': {
          if (store.locked.peek()) return;
          const many = existingItems(shown.peek(), peekSelectedItems(ui));
          if (many.length > 1) {
            dialogsRef.current.requestDeleteItems(many);
            return;
          }
          const current = resolveSelection(shown.peek(), ui.selection.peek());
          if (current?.kind === 'image') {
            dialogsRef.current.requestDeleteImage(current.image);
          } else if (current?.kind === 'marking') {
            dialogsRef.current.requestDeleteMarking(current.marking);
          } else if (current?.kind === 'arrow') {
            dialogsRef.current.requestDeleteArrow(current.arrow);
          }
          return;
        }
        case 'toggle-lock': {
          // Só a trava muda: seleção e anotações seguem livres, mas o somente leitura vale.
          if (store.locked.peek()) return;
          const many = existingItems(shown.peek(), peekSelectedItems(ui));
          if (many.length > 1) {
            // Todos trancados: destranca todos; senão tranca todos.
            const project = shown.peek();
            const index = project ? projectIndex(project) : null;
            const allLocked = many.every((i) =>
              i.kind === 'image'
                ? index?.containers.get(i.id)?.locked
                : i.kind === 'arrow'
                  ? index?.arrows.get(i.id)?.locked
                  : index?.markings.get(i.id)?.locked,
            );
            actions.setItemsLocked(many, !allLocked);
            return;
          }
          const current = resolveSelection(shown.peek(), ui.selection.peek());
          if (current?.kind === 'image') {
            actions.setImageLocked(current.image.id, !current.image.locked);
          } else if (current?.kind === 'marking') {
            actions.setMarkingLocked(current.marking.id, !current.marking.locked);
          } else if (current?.kind === 'arrow') {
            actions.setArrowLocked(current.arrow.id, !current.arrow.locked);
          }
          return;
        }
        case 'view-mode':
          return setViewMode(ui, !ui.viewMode.peek());
        case 'hide-window': {
          // Quem faz o retângulo de seleção tem o Shift apertado: com gesto em andamento, o Esc cancela.
          if (canvas.current?.cancelInteraction()) return;
          const focused = focusedWindow();
          if (focused) closeToolWindow(focused.id);
          return;
        }
        case 'toggle-window': {
          const { window } = shortcut;
          // Fechada ou sem foco dentro: abre e foca; já em foco: esconde.
          if (focusedWindow()?.id === window) closeToolWindow(window);
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
          toggleReviewLegend(ui);
          return;
        case 'apply':
          void reviewRef.current.apply();
          return;
      }
    };

    // As setas movem a seleção: apertar e soltar é um gesto; segurar soma passos no mesmo gesto.
    const nudge = new NudgeSession(actions, () =>
      existingItems(shown.peek(), peekSelectedItems(ui)),
    );
    const onNudge = (e: KeyboardEvent, dx: number, dy: number) => {
      const busy = store.locked.peek() || review.proposalId.peek() !== null;
      if (busy || !arrowsBelongToEditor(e.target) || canvas.current?.isInteracting()) {
        return;
      }
      e.preventDefault();
      nudge.step(e.key, dx, dy);
    };

    const onKeyDown = (e: KeyboardEvent) => {
      // Qualquer outra tecla (o Shift solto no meio, Ctrl+Z...) fecha o gesto das setas.
      if (shortcutFor(e, altNumbers)?.kind !== 'nudge') nudge.end();
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
      if (shortcut.kind === 'nudge') return onNudge(e, shortcut.dx, shortcut.dy);
      if (
        shortcut.kind === 'view-mode' ? isTypingField(e.target) : isTextInput(e.target)
      ) {
        return;
      }
      if (!applies(shortcut)) return;
      e.preventDefault();
      if (wrapIgnored(shortcut, e)) return;
      run(shortcut);
    };
    const endNudge = () => nudge.end();
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', endNudge);
    window.addEventListener('blur', endNudge);
    return () => {
      nudge.end();
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', endNudge);
      window.removeEventListener('blur', endNudge);
    };
  }, [editor, store, ui, canvas, actions, review, shown]);
}
