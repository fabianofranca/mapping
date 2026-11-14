import { useEffect, useRef } from 'preact/hooks';
import { t } from '../i18n';
import { useEditor } from '../ui/EditorContext';
import { overflowButton, viewControl, viewModeButton } from '../ui/ViewModePanel';
import { ActionMenu, type ActionMenuItem } from '../ui/ActionMenu';
import { IconButton, Segmented } from '../ui/controls';
import { armComment, cancelComment } from '../store/threadUi';
import { selectedItems, setViewMode, showToast } from '../store/ui';
import { proposalErrorMessage } from '../ui/labels';
import { REVIEW_ERROR_MS } from '../ui/review/useReviewCommands';
import type { ProposalActionError } from '../store/proposalActions';
import { SHORTCUT_LABELS } from './shortcuts';

// Tool buttons of the main bar and of the breadcrumbs bar.

/** Navegar | Desenhar. */
export function ModeButtons() {
  const { store, ui } = useEditor();
  return (
    <Segmented
      items={[
        { id: 'navigate', label: t('editor.modeNavigate'), icon: 'pan' },
        {
          id: 'draw',
          label: t('editor.modeDraw'),
          icon: 'draw',
          disabled: store.locked.value || ui.viewMode.value,
        },
      ]}
      value={ui.mode.value}
      onSelect={(mode) => (ui.mode.value = mode)}
    />
  );
}

export function AddImagesButton({
  busy,
  onAdd,
}: {
  readonly busy: boolean;
  readonly onAdd: () => void;
}) {
  const { store } = useEditor();
  return (
    <IconButton
      icon="addImage"
      label={t('editor.addImages')}
      text={t('editor.addImages')}
      disabled={store.locked.value || busy}
      onClick={onAdd}
    />
  );
}

/** New container: next to "Add images". */
export function AddContainerButton({ onAdd }: { readonly onAdd: () => void }) {
  const { store } = useEditor();
  return (
    <IconButton
      icon="container"
      label={t('container.new')}
      text={t('container.new')}
      disabled={store.locked.value}
      onClick={onAdd}
    />
  );
}

/**
 * Comment (decision 25), next to New container: turns the pins on and arms a click on the canvas
 * (on an item, the thread stays on the item; on an empty place, on a point). Disabled in read-only,
 * in review and in view mode.
 */
export function CommentButton() {
  const { store, ui, review } = useEditor();
  const armed = ui.commentArm.value !== null;
  const blocked =
    store.locked.value || review.proposalId.value !== null || ui.viewMode.value;
  return (
    <IconButton
      icon="chatAdd"
      label={t('comments.add')}
      text={t('comments.add')}
      tooltip={blocked ? t('comments.addDisabled') : t('comments.addTip')}
      pressed={armed}
      disabled={blocked}
      onClick={() => (armed ? cancelComment(ui) : armComment(ui))}
    />
  );
}

/**
 * Threads (decision 24), in the canvas bar next to View: turns the pins on and off. When off,
 * it shows the count of the threads awaiting a human and a dot if there is an unread message.
 */
function usePinsState() {
  const { ui, derived } = useEditor();
  const on = ui.commentPins.value;
  const waiting = derived.threads.awaitingHumanCount.value;
  return {
    on,
    waiting,
    showCount: !on && waiting > 0,
    alert: !on && derived.threads.unreadIds.value.size > 0,
  };
}

export function PinsButton() {
  const { ui } = useEditor();
  const { on, waiting, showCount, alert } = usePinsState();
  return (
    <IconButton
      icon="chat"
      label={t('comments.pins')}
      tooltip={
        showCount
          ? `${t('comments.pinsTip')} · ${t('comments.pinsAwaiting', { count: String(waiting) })}`
          : t('comments.pinsTip')
      }
      pressed={on}
      {...(showCount ? { badge: String(waiting) } : {})}
      alert={alert}
      onClick={() => (ui.commentPins.value = !ui.commentPins.peek())}
    />
  );
}

/** Desfazer e refazer. */
export function HistoryButtons() {
  const { store, ui } = useEditor();
  // Saving the proposal failed when undoing/redoing an application: the step was reverted.
  const failure = store.linkFailure.value;
  useEffect(() => {
    if (failure) {
      showToast(
        ui,
        proposalErrorMessage(failure.error as ProposalActionError),
        REVIEW_ERROR_MS,
      );
    }
  }, [failure, ui]);
  return (
    <>
      <IconButton
        icon="undo"
        label={t('editor.undo')}
        shortcut={SHORTCUT_LABELS.undo}
        disabled={!store.canUndo.value}
        onClick={() => store.undo()}
      />
      <IconButton
        icon="redo"
        label={t('editor.redo')}
        shortcut={SHORTCUT_LABELS.redo}
        disabled={!store.canRedo.value}
        onClick={() => store.redo()}
      />
    </>
  );
}

/** Fit all: in the breadcrumbs bar. */
export function FitButton() {
  const { canvas } = useEditor();
  return (
    <IconButton
      icon="fit"
      label={t('editor.fitAll')}
      shortcut={SHORTCUT_LABELS.fitAll}
      onClick={() => canvas.current?.fitAll()}
    />
  );
}

/** Fit selection: zoom and center on the selected items; disabled without a selection. */
export function FitSelectionButton() {
  const { canvas, ui } = useEditor();
  const empty = selectedItems(ui).length === 0;
  return (
    <IconButton
      icon="fit-selection"
      label={t('editor.fitSelection')}
      shortcut={SHORTCUT_LABELS.fitSelection}
      disabled={empty || ui.viewMode.value}
      onClick={() => canvas.current?.fitSelection()}
    />
  );
}

/** View: turns on view mode, the canvas just for looking (Alt+H). */
export function ViewModeButton() {
  const { ui } = useEditor();
  const button = viewModeButton;
  const on = ui.viewMode.value;
  const wasOn = useRef(on);
  // On leaving the mode the "Show on canvas" button gets disabled and the panel goes away: if the
  // focus was on them (or got lost on the body), it goes to View.
  useEffect(() => {
    if (wasOn.current && !on) {
      const active = document.activeElement;
      const lost =
        !active ||
        active === document.body ||
        (active instanceof HTMLButtonElement && active.disabled);
      if (lost) viewControl()?.focus();
    }
    wasOn.current = on;
  }, [on, button]);
  return (
    <IconButton
      icon="eye"
      label={t('view.viewMode')}
      shortcut={SHORTCUT_LABELS.viewMode}
      tooltip={t('view.viewModeHint')}
      tooltipSuppressed={ui.viewPanel.value}
      pressed={on}
      buttonRef={button}
      onClick={() => setViewMode(ui, !ui.viewMode.peek())}
    />
  );
}

/**
 * The "⋯" of the canvas bar narrowed in review (BC2): it holds the controls the bar hides
 * (Threads, View, Show on canvas, Fit all and selection), with the same actions and
 * texts as the buttons, and the thread badge and dot. Only the CSS shows it.
 */
export function OverflowMenu() {
  const { ui, canvas } = useEditor();
  const { on: pins, showCount, waiting, alert } = usePinsState();
  const view = ui.viewMode.value;
  const items: ActionMenuItem[] = [
    {
      label: t('comments.pins'),
      checked: pins,
      onSelect: () => (ui.commentPins.value = !ui.commentPins.peek()),
    },
    {
      label: t('view.viewMode'),
      checked: view,
      shortcut: SHORTCUT_LABELS.viewMode,
      onSelect: () => setViewMode(ui, !ui.viewMode.peek()),
    },
    {
      label: t('view.panelOpen'),
      disabled: !view,
      onSelect: () => (ui.viewPanel.value = true),
    },
    {
      label: t('editor.fitAll'),
      shortcut: SHORTCUT_LABELS.fitAll,
      onSelect: () => canvas.current?.fitAll(),
    },
    {
      label: t('editor.fitSelection'),
      shortcut: SHORTCUT_LABELS.fitSelection,
      disabled: selectedItems(ui).length === 0 || view,
      onSelect: () => canvas.current?.fitSelection(),
    },
  ];
  return (
    <ActionMenu
      className="canvas-bar-more"
      icon="more"
      label={t('editor.moreControls')}
      items={items}
      triggerRef={overflowButton}
      {...(showCount ? { badge: String(waiting) } : {})}
      alert={alert}
    />
  );
}
