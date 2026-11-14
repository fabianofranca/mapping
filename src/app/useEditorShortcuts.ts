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
import { cancelComment } from '../store/threadUi';
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
import {
  closeReviewLegendOnEscape,
  toggleReviewLegend,
} from '../ui/review/ReviewCanvasControls';
import { arrangeMarking, canArrangeMarking } from '../ui/arrange';
import { canWrapNow, currentWrapItems, wrapItemsNow } from './wrapSelection';
import {
  canCopyItems,
  canCopyCrop,
  copyCrop,
  copyKeyBelongsToProperty,
  copyReference,
  copyShortcutTarget,
  focusedPropertyTarget,
  type CopyTarget,
} from './itemClipboard';

interface FocusedWindow {
  readonly id: ToolWindowId;
  readonly side: ToolWindowSide;
  readonly el: Element;
}

/** Tool window that contains the focus (or `null` outside them). */
function focusedWindow(): FocusedWindow | null {
  const el = document.activeElement?.closest('[data-window]');
  const name = el?.getAttribute('data-window');
  const id = TOOL_WINDOWS.find((candidate) => candidate === name);
  return el && id ? { id, side: WINDOW_SIDE[id], el } : null;
}

/**
 * Does the keyboard belong to the focused field, not the shortcut? Alt+H applies in checkboxes and radios; Ctrl+C in a
 * text field of a property, with no selected text, copies its reference (with
 * a selection, or outside a property, the native copy continues).
 */
function fieldOwnsKey(shortcut: Shortcut, target: EventTarget | null): boolean {
  if (shortcut.kind === 'view-mode') return isTypingField(target);
  if (!isTextInput(target)) return false;
  const property =
    shortcut.kind === 'copy-reference' &&
    copyKeyBelongsToProperty(target) &&
    focusedPropertyTarget() !== null;
  return !property;
}

/**
 * Resizes the focused window by 16px in the arrow direction (B2). In the stacked
 * Layers, ↑/↓ move the divider with the Tree and ←/→ the column width.
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
 * Keyboard shortcuts. Open dialogs handle their own keyboard (Esc).
 * The listener is subscribed once; `dialogs` points to the current version.
 * `enabled` false (narrow window, with the editor behind the notice) turns them all off.
 */
export function useEditorShortcuts(
  dialogs: EditorDialogs,
  commands: ProjectCommands,
  enabled = true,
  busy = false,
): void {
  const editor = useEditor();
  const { store, ui, canvas, actions, review } = editor;
  // The project in view (`shownProject`): in the review's Proposed view, an item that only exists
  // in the proposal also has a parent and children for Alt+↑/↓ (phase 8.2, P1). Outside the review it is
  // the confirmed one; the gesture preview only changes geometry, which no shortcut here consults.
  const shown = review.derived.shownProject;
  // Review: deciding and applying report errors like the buttons do.
  const decide = useDecide();
  const apply = useApplyAccepted();
  const reviewRef = useRef({ decide, apply });
  reviewRef.current = { decide, apply };
  const dialogsRef = useRef(dialogs);
  dialogsRef.current = dialogs;
  const commandsRef = useRef(commands);
  commandsRef.current = commands;
  // Import or swap in progress: exporting would wipe the progress (the buttons also wait).
  const busyRef = useRef(busy);
  busyRef.current = busy;
  const enabledRef = useRef(enabled);
  enabledRef.current = enabled;

  useEffect(() => {
    const altNumbers = altNumbersAvailable(
      globalThis.navigator?.userAgent ?? '',
      isStandalone(),
    );

    /** Alt+↑ / Alt+↓: moves along the selection path (B11). */
    const moveSelection = (up: boolean) => {
      const project = shown.peek();
      const current = resolveSelection(project, ui.selection.peek());
      if (!project || !current) return;
      // The arrow has no parent or children to walk through.
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
        // Container inside a canvas marking: goes up to it.
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
     * Item that Ctrl+C / Ctrl+Alt+C would copy now, or `null` when copying is left to the
     * browser: project outside a folder, nothing selected, or text selected on the page.
     */
    const copyTarget = (shortcut: Shortcut): CopyTarget | null => {
      if (!canCopyItems(editor)) return null;
      if (shortcut.kind === 'copy-crop') {
        const target = copyShortcutTarget(editor);
        // Container without a file has no crop: the shortcut does not take the key.
        return target?.kind === 'm' && canCopyCrop(shown.peek(), target.id)
          ? target
          : null;
      }
      if (globalThis.getSelection?.()?.toString()) return null;
      return copyShortcutTarget(editor);
    };

    /**
     * The shortcut takes the key only when it has something to do; otherwise the event goes on to the browser
     * (native copy, "find next"): copy with no item to copy; wrap with nothing that can
     * enter a parent marking (read-only, review, no selection, only notes and arrows).
     */
    const applies = (shortcut: Shortcut): boolean => {
      if (shortcut.kind === 'copy-reference' || shortcut.kind === 'copy-crop') {
        return copyTarget(shortcut) !== null;
      }
      if (shortcut.kind === 'wrap') return canWrapNow(editor, currentWrapItems(editor));
      return true;
    };

    /**
     * Wrap does not act on a repeated key (holding Ctrl+G would nest one parent per repeat) nor
     * with a pointer gesture in progress (the store would refuse and the notice would appear in the middle of the
     * drag). `preventDefault` was already called: the browser's "find next" stays out.
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
          if (target?.kind === 'm') void copyCrop(editor, target.id);
          return;
        }
        case 'arrange': {
          // Container in a row or column with children; otherwise (or read-only) the shortcut does not act.
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
          // Gesture in progress: cancels. Otherwise, with several items goes back to the primary; finally clears.
          if (canvas.current?.cancelInteraction()) return;
          // The review legend open, with focus on the button or the canvas: Esc closes only it.
          if (closeReviewLegendOnEscape(ui)) return;
          // Comment armed: Esc disarms and returns to the previous tool.
          if (cancelComment(ui)) return;
          // In view mode Esc leaves the mode (the open panel already consumed its Esc).
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
          // Only the lock changes: selection and annotations stay free, but read-only applies.
          if (store.locked.peek()) return;
          const many = existingItems(shown.peek(), peekSelectedItems(ui));
          if (many.length > 1) {
            // All locked: unlocks all; otherwise locks all.
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
          // Whoever makes the selection rectangle has Shift pressed: with a gesture in progress, Esc cancels.
          if (canvas.current?.cancelInteraction()) return;
          const focused = focusedWindow();
          if (focused) closeToolWindow(focused.id);
          return;
        }
        case 'toggle-window': {
          const { window } = shortcut;
          // Closed or without focus inside: opens and focuses; already focused: hides.
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
        case 'fit-all':
          return canvas.current?.fitAll();
        case 'fit-selection':
          return canvas.current?.fitSelection();
        case 'zoom-reset':
          return canvas.current?.zoomTo(1);
        case 'export':
          if (busyRef.current) return;
          return void commandsRef.current.exportProject();
        case 'layers':
          return showAndFocusToolWindow('layers');
        case 'help':
          return dialogsRef.current.show({ kind: 'help' });
        case 'settings':
          return dialogsRef.current.show({ kind: 'settings' });
      }
    };

    /** Review shortcuts (HANDOFF-PROPOSALS 6): they act on the selected level. */
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

    // The arrows move the selection: pressing and releasing is one gesture; holding adds steps in the same gesture.
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
      // Any other key (Shift released in the middle, Ctrl+Z...) closes the arrow gesture.
      const shortcut = shortcutFor(e, altNumbers);
      if (shortcut?.kind !== 'nudge') nudge.end();
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
      if (!shortcut) return;
      if (shortcut.kind === 'nudge') return onNudge(e, shortcut.dx, shortcut.dy);
      if (fieldOwnsKey(shortcut, e.target)) return;
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
