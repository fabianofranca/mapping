import { signal } from '@preact/signals';
import { createContext, type Ref, type RefObject } from 'preact';
import { useContext, useLayoutEffect, useRef, useState } from 'preact/hooks';

// App focus model (stage 8, phase 8.3; `docs/ARCHITECTURE.md`, "Focus and keyboard").
// A modal (`Dialog`, `RefPicker`) opens in the same render that puts it in the DOM and, on exit,
// returns focus to whoever opened it; never to `body`.

/** Controls that receive focus (for the initial focus and the last resort of the return). */
export const FOCUSABLE = [
  'input:not([disabled]):not([hidden])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  'button:not([disabled])',
  'a[href]',
  '[tabindex]:not([tabindex="-1"])',
].join(', ');

/**
 * Where focus goes on close when whoever opened it left the DOM (or nobody opened it,
 * as in Export, which generates the zip before opening): the element, or a function read at
 * close time (the row that took the place of the deleted one, for example).
 */
export type FocusReturn = HTMLElement | null | (() => HTMLElement | null | undefined);

/** Who had focus on open and its ancestors (from the closest to the farthest). */
export interface FocusOrigin {
  readonly opener: Element | null;
  readonly containers: readonly Element[];
}

/** Stores who has focus now (before the modal takes it). */
export function captureFocusOrigin(): FocusOrigin {
  const active = document.activeElement;
  const opener = active === document.body ? null : active;
  const containers: Element[] = [];
  for (
    let el = opener?.parentElement ?? null;
    el && el !== document.body && el !== document.documentElement;
    el = el.parentElement
  ) {
    containers.push(el);
  }
  return { opener, containers };
}

function tryFocus(el: Element | null | undefined, scope: Element): boolean {
  if (!(el instanceof HTMLElement) || !el.isConnected || el === document.body)
    return false;
  if (scope.contains(el) || el.matches(':disabled')) return false;
  el.focus();
  return document.activeElement === el;
}

/** App root (`App.tsx`): the last resort is the first control inside it. */
const FOCUS_ROOT = '[data-focus-root]';

/** Tool window (`ToolWindow`): a `section` with `tabIndex=-1`. */
const TOOL_WINDOW = '[data-window]';

/**
 * Returns focus on closing `scope` (a modal, a menu with no trigger), called after it
 * left: to whoever opened it; if that left the DOM, to the explicit target and, failing that, to the
 * tool window that contained whoever opened it; with no explicit target, to the closest
 * focusable container of whoever opened it (or to the first control inside it); lastly, to the first
 * app control (`data-focus-root`), so the keyboard is not lost on `body`. Never to
 * `body`. It does nothing if focus already went elsewhere on purpose (outside `scope` and
 * `body`): whoever closes and takes focus elsewhere owns that closing.
 */
export function restoreFocus(
  scope: HTMLElement,
  origin: FocusOrigin,
  returnFocus?: FocusReturn,
): void {
  const active = document.activeElement;
  // A control that became disabled while focused (the order button that reached the end) is
  // lost: the browser no longer delivers keys to it.
  const lost =
    active === null ||
    active === document.body ||
    scope.contains(active) ||
    active.matches(':disabled');
  if (!lost) return;
  if (tryFocus(origin.opener, scope)) return;
  if (returnFocus !== undefined) {
    // With an explicit target, it is the closer's decision: without it in the DOM, no guessing
    // a container (stage 8, F2). Only the whole tool window that contained whoever opened it
    // comes before the last resort (stage #1273, decision 1): focus stays on the window, which
    // already shows what changed, and does not go to the first app control.
    const explicit = typeof returnFocus === 'function' ? returnFocus() : returnFocus;
    if (tryFocus(explicit, scope)) return;
    const win = origin.containers.find((c) => c.isConnected && c.matches(TOOL_WINDOW));
    if (tryFocus(win, scope)) return;
  } else {
    for (const container of origin.containers) {
      if (!container.isConnected) continue;
      if (tryFocus(container, scope)) return;
      for (const el of container.querySelectorAll(FOCUSABLE)) {
        if (tryFocus(el, scope)) return;
      }
    }
  }
  const root = document.querySelector(FOCUS_ROOT);
  for (const el of root?.querySelectorAll(FOCUSABLE) ?? []) {
    if (tryFocus(el, scope)) return;
  }
}

/**
 * `restoreFocus` after the render that closed: Preact unmounts the modal before
 * applying the rest of the same render (the deleted row, the swapped item), so only
 * after it do we know whether whoever opened it is still in the DOM. It is the model's only
 * microtask wait: whoever takes focus elsewhere on purpose does so by the commit, before it.
 */
export function restoreFocusAfterRender(
  scope: HTMLElement,
  origin: FocusOrigin | null,
  returnFocus: { readonly current: FocusReturn | undefined },
): void {
  if (!origin) return;
  queueMicrotask(() => restoreFocus(scope, origin, returnFocus.current));
}

/**
 * Keeps focus after an action that rearranges the screen or disables the control that had it
 * (the ⋯ of a Tree row that changes parent, the order button that reaches the end): stores who
 * has focus now and, after the render, if it fell on `body`, returns it by the rule of
 * `restoreFocus` (to whoever had it; failing that, the `returnFocus`, the tool window that held it
 * or the first app control). Call with focus still on the originating control. If focus already
 * went elsewhere on purpose, it does nothing.
 */
export function keepFocusAfterAction(returnFocus?: FocusReturn): void {
  const origin = captureFocusOrigin();
  if (!origin.opener) return;
  // Two microtasks: the first yields to the render that the action (still to come, in the
  // same gesture) requested; the second checks focus after it.
  queueMicrotask(() =>
    queueMicrotask(() =>
      restoreFocus(document.createElement('span'), origin, returnFocus),
    ),
  );
}

/**
 * Dialog slot of a host (the editor, the home screen, the steps of a creation): only one
 * dialog at a time, and a swap (Settings › View shortcuts) inherits whoever opened the first.
 * The first `Dialog` mounted under the slot claims the origin; the following ones (a dialog
 * opened on top, like the steps of `SpecsDialog`) keep their own.
 */
export interface DialogSlot {
  claim(): FocusOrigin | null;
}

function createSlot(origin: FocusOrigin): DialogSlot {
  let claimed = false;
  return {
    claim() {
      if (claimed) return null;
      claimed = true;
      return origin;
    },
  };
}

/** The host wraps the slot's dialog with this context (`slot` of `useDialogSlot`). */
export const DialogSlotContext = createContext<DialogSlot | null>(null);

/** Focus origin of a modal: the host slot's, if any, otherwise whoever has focus now. */
export function useFocusOrigin(): FocusOrigin {
  const slot = useContext(DialogSlotContext);
  const origin = useRef<FocusOrigin | null>(null);
  origin.current ??= slot?.claim() ?? captureFocusOrigin();
  return origin.current;
}

export interface DialogSlotState<T> {
  /** The open dialog (only one at a time), with the data it needs. */
  readonly current: T | null;
  /** For the `DialogSlotContext` around the open dialog. */
  readonly slot: DialogSlot | null;
  /** Opens `next`; with a dialog already open, swaps to it and keeps whoever opened the first. */
  show(next: T): void;
  close(): void;
  /** Closes only if the currently open dialog matches `test` (after a wait). */
  closeIf(test: (current: T) => boolean): void;
}

/**
 * State of a dialog slot. The focus origin is stored in the gesture that opens the first
 * dialog, before any render, and passes from one dialog to the next on a swap:
 * without that, the new dialog is born after the old one takes away the button that had focus, and on
 * close there is nobody to return it to (stage 8, F3).
 */
export function useDialogSlot<T>(): DialogSlotState<T> {
  const [state, setState] = useState<{
    readonly current: T | null;
    readonly slot: DialogSlot | null;
  }>({ current: null, slot: null });
  // What is open now (gestures may open and swap before rendering).
  const open = useRef<{ current: T; origin: FocusOrigin } | null>(null);
  const close = () => {
    open.current = null;
    setState({ current: null, slot: null });
  };
  return {
    current: state.current,
    slot: state.slot,
    show(next) {
      const origin = open.current?.origin ?? captureFocusOrigin();
      open.current = { current: next, origin };
      setState({ current: next, slot: createSlot(origin) });
    },
    close,
    closeIf(test) {
      if (open.current && test(open.current.current)) close();
    },
  };
}

/**
 * How many modals are open now. The editor shortcuts and image pasting do not act
 * with a modal open (instead of looking for `dialog[open]` in the document).
 */
export const modalOpen = signal(0);

/**
 * Life cycle of a modal with a native `<dialog>`: in the same render that puts it in the DOM,
 * opens it (`showModal`), gives the initial focus, counts it in `modalOpen`, registers the return;
 * on exit, closes before leaving the DOM (with the modal open, the rest of the page is inert) and returns
 * focus. In `useLayoutEffect`: a `<dialog>` in the DOM is always open and always has a return,
 * even if it leaves before the next frame (stage 8, F1).
 */
export function useModal(
  ref: RefObject<HTMLDialogElement>,
  origin: FocusOrigin,
  returnFocus: FocusReturn | undefined,
  focusInitial: (dialog: HTMLDialogElement) => void,
): void {
  // Read on close: the caller may change the target while the modal is open.
  const returnTo = useRef(returnFocus);
  returnTo.current = returnFocus;
  const from = useRef(origin);
  from.current = origin;
  const initial = useRef(focusInitial);
  initial.current = focusInitial;

  useLayoutEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    try {
      dialog.showModal();
    } catch {
      // Feature detection: without `showModal` (old browser) it opens without a modal.
      dialog.setAttribute('open', '');
    }
    initial.current(dialog);
    modalOpen.value += 1;
    return () => {
      try {
        if (dialog.open) dialog.close();
      } catch {
        dialog.removeAttribute('open');
      }
      modalOpen.value -= 1;
      restoreFocusAfterRender(dialog, from.current, returnTo);
    };
    // Opens once per mount; the rest is read through the refs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}

/**
 * Closing a menu or popover (Esc, choice, outside click, scroll): if focus is inside
 * it (`root`, trigger included), it goes to the trigger, before the menu leaves the DOM; otherwise
 * it stays where the click put it. On a choice, call before the item's action: a dialog opened by it
 * keeps the trigger as whoever opened it (stage 8, F6).
 */
export function returnFocusToTrigger(
  root: Element | null,
  trigger: HTMLElement | null | undefined,
): void {
  if (root?.contains(document.activeElement) && trigger?.isConnected) trigger.focus();
}

/** Passes the element to an outside `ref` (object or function), besides its own. */
export function assignRef<T>(ref: Ref<T> | undefined, value: T | null): void {
  if (typeof ref === 'function') ref(value);
  else if (ref) ref.current = value;
}

/**
 * Focus after the render, in the app's single idiom: `request(target)` stores the request and
 * schedules a render of the component; the request is fulfilled in its `useLayoutEffect`,
 * when the target (the new row, the moved row's handle, the button that remains) is already in the DOM.
 * No `requestAnimationFrame` or microtask: focus arrives in the same commit.
 */
export function useFocusRequest(): (
  target: () => HTMLElement | null | undefined,
) => void {
  const pending = useRef<(() => HTMLElement | null | undefined) | null>(null);
  const [, rerender] = useState(0);
  useLayoutEffect(() => {
    const target = pending.current;
    if (!target) return;
    pending.current = null;
    target()?.focus();
  });
  return (target) => {
    pending.current = target;
    rerender((n) => n + 1);
  };
}
