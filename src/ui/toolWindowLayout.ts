import type { LayoutSpace, ToolWindowId, ToolWindowSide } from '../store/toolWindows';
import {
  TOOL_WINDOWS,
  WINDOW_SIDE,
  hideToolWindow,
  isToolWindowOpen,
  showToolWindow,
  sideWidth,
} from '../store/toolWindows';

// Space available for the windows, measured in the DOM. It lives outside the components so that
// the divider drag and Ctrl+Shift+arrows use the same calculation (B2).

/**
 * Element that holds the windows and the canvas (without the side strips): the class belongs to the CSS; the
 * measurement finds the element by `data-panes` (a class selector crosses components).
 */
export const PANES_CLASS = 'editor-panes';

/**
 * Space on the side from an element inside the windows. Without a measured DOM (tests,
 * first frame), it falls back to the browser window, which is a safe limit.
 */
export function spaceFor(el: Element | null, side: ToolWindowSide): LayoutSpace {
  const panes = el?.closest('[data-panes]');
  const box = panes?.getBoundingClientRect();
  return {
    width: box?.width || globalThis.innerWidth || 0,
    height: box?.height || globalThis.innerHeight || 0,
    otherWidth:
      side === 'left' ? sideWidth('right') : side === 'right' ? sideWidth('left') : 0,
  };
}

/** Focuses the tool window (its section is focusable), if it is drawn. */
export function focusToolWindow(id: ToolWindowId): void {
  document.querySelector<HTMLElement>(`[data-window="${id}"]`)?.focus();
}

/**
 * Who had focus when each window opened. It lives here (UI), never in the store; it is not
 * persisted: a window open since load has nothing stored.
 */
const openers = new Map<ToolWindowId, Element>();

/** Attributes that mark the strip button and the canvas area (fallback targets). */
const STRIP_BUTTON_ATTR = 'data-strip-window';
const CANVAS_AREA_ATTR = 'data-canvas-area';

function windowElement(id: ToolWindowId): HTMLElement | null {
  return document.querySelector<HTMLElement>(`[data-window="${id}"]`);
}

function focusIfOutside(el: Element | null | undefined, scope: Element): boolean {
  if (!(el instanceof HTMLElement) || !el.isConnected || el === document.body)
    return false;
  if (scope.contains(el)) return false;
  el.focus();
  return document.activeElement === el;
}

/** Moves focus to the canvas area (the fallback target of whoever closes something with focus in it). */
export function focusCanvasArea(): boolean {
  const canvas = document.querySelector<HTMLElement>(`[${CANVAS_AREA_ATTR}]`);
  canvas?.focus();
  return canvas !== null && document.activeElement === canvas;
}

/**
 * If focus is inside window `id`, moves it, with the window still in the DOM, to: whoever opened →
 * window button in the strip → canvas. Synchronous: no frame has focus on `body`.
 */
function releaseFocus(id: ToolWindowId): void {
  const el = windowElement(id);
  if (!el?.contains(document.activeElement)) return;
  if (focusIfOutside(openers.get(id), el)) return;
  if (focusIfOutside(document.querySelector(`[${STRIP_BUTTON_ATTR}="${id}"]`), el))
    return;
  focusIfOutside(document.querySelector(`[${CANVAS_AREA_ATTR}]`), el);
}

/** Active tab of the bottom window, where focus goes when the switch remounts the window. */
function focusActiveTab(id: ToolWindowId): void {
  windowElement(id)
    ?.querySelector<HTMLElement>('[role="tab"][aria-selected="true"]')
    ?.focus();
}

/**
 * Opens the window (strip, tab, shortcut). Stores who has focus, if the window was closed, and
 * handles the windows that leave because of it (decisions 3 and 4): the focus that was in them goes to the
 * destination of the order above; in the bottom window, to the new one's active tab (the switch remounts the section,
 * so this waits for rendering, under the same exception as `showAndFocusToolWindow`).
 */
export function openToolWindow(id: ToolWindowId): void {
  const active = document.activeElement;
  const wasOpen = isToolWindowOpen(id);
  const leaving = TOOL_WINDOWS.filter(
    (other) =>
      other !== id &&
      isToolWindowOpen(other) &&
      windowElement(other)?.contains(active ?? null),
  );
  if (!wasOpen && active && active !== document.body) openers.set(id, active);
  showToolWindow(id);
  for (const other of leaving) {
    if (isToolWindowOpen(other)) continue;
    if (WINDOW_SIDE[other] === 'bottom' && WINDOW_SIDE[id] === 'bottom') {
      queueMicrotask(() => focusActiveTab(id));
    } else {
      releaseFocus(other);
    }
  }
}

/**
 * Closes the window and returns focus, if it was inside it (decision 1). Sole owner of
 * closing: the X, `hide-window`, `toggle-window` and the strip click all go through here.
 */
export function closeToolWindow(id: ToolWindowId): void {
  releaseFocus(id);
  openers.delete(id);
  hideToolWindow(id);
}

/** Toggles from the strip or the shortcut: opens storing the origin, or closes returning focus. */
export function toggleToolWindowFocus(id: ToolWindowId): void {
  if (isToolWindowOpen(id)) closeToolWindow(id);
  else openToolWindow(id);
}

/**
 * Opens the window and moves focus to it (the active layer chip and Ctrl+L). Focus
 * waits for the window to be drawn: opening is just a signal change, and the rendering that
 * it schedules runs in a microtask before this one. It is one of the two documented exceptions to the
 * `useFocusRequest` idiom (module function, no component; `docs/ARCHITECTURE.md`,
 * "Focus and keyboard").
 */
export function showAndFocusToolWindow(id: ToolWindowId): void {
  // Switching tabs in the already open bottom window: focus goes to the active tab (decision 3), not to the
  // section, wherever it comes from (tab, content or canvas).
  const switchesBottomTab =
    WINDOW_SIDE[id] === 'bottom' &&
    TOOL_WINDOWS.some(
      (other) =>
        other !== id && WINDOW_SIDE[other] === 'bottom' && isToolWindowOpen(other),
    );
  openToolWindow(id);
  queueMicrotask(() => (switchesBottomTab ? focusActiveTab(id) : focusToolWindow(id)));
}

/**
 * Focus target when leaving the review (stage #515, FN1): leaving removes the clicked button from the screen
 * (the review strip), so focus goes to the proposal button (Review or Continue) in the
 * Proposals window, if it is open; otherwise, to the canvas.
 */
export function reviewExitTarget(proposalId: string | null): HTMLElement | null {
  if (proposalId !== null) {
    for (const row of document.querySelectorAll<HTMLElement>('[data-proposal]')) {
      if (row.dataset.proposal !== proposalId) continue;
      const action = row.querySelector<HTMLElement>('[data-proposal-action]');
      if (action) return action;
    }
  }
  return document.querySelector<HTMLElement>(`[${CANVAS_AREA_ATTR}]`);
}

const EXIT_FOCUS_TRIES = 30;
const EXIT_FOCUS_STEP_MS = 16;

/**
 * Moves focus to the exit target, with the strip still in the DOM (no frame on `body`).
 * When the review closes, the Proposals window only swaps the tree for the list in the next
 * render: the proposal button does not exist yet. Focus goes to the canvas now and moves on to the
 * button when it appears (up to ~0.5 s), if the person has not moved it elsewhere.
 */
export function focusReviewExitTarget(proposalId: string | null): void {
  const first = reviewExitTarget(proposalId);
  first?.focus();
  if (proposalId === null || (first && first !== canvasArea())) return;
  const parked = first;
  let tries = 0;
  const retry = () => {
    const target = reviewExitTarget(proposalId);
    if (target && target !== canvasArea()) {
      const now = document.activeElement;
      if (now === parked || now === document.body || now === null) target.focus();
      return;
    }
    if (++tries < EXIT_FOCUS_TRIES) setTimeout(retry, EXIT_FOCUS_STEP_MS);
  };
  setTimeout(retry, EXIT_FOCUS_STEP_MS);
}

function canvasArea(): HTMLElement | null {
  return document.querySelector<HTMLElement>(`[${CANVAS_AREA_ATTR}]`);
}
