// jsdom implements neither `showModal`/`close` nor the inertness of the rest of the page
// while a modal dialog is open (enabled for every DOM test in `tests/setup.ts`, stage 8, F8).
// In Chrome, while the modal is open, `focus()` on an element outside it does nothing; and,
// when the dialog leaves the DOM with focus inside, focus falls to `body`. This simulator
// reproduces both for the focus-on-close tests (stage 7, finding A1): without it, a `focus()`
// made while the modal is still open would pass in jsdom and fail in the browser.

import { vi } from 'vitest';

interface Saved {
  readonly showModal: PropertyDescriptor | undefined;
  readonly close: PropertyDescriptor | undefined;
  readonly focus: PropertyDescriptor | undefined;
}

let saved: Saved | null = null;
const modals: HTMLDialogElement[] = [];

/** The topmost modal, if it is still open and in the DOM. */
function topModal(): HTMLDialogElement | undefined {
  for (let i = modals.length - 1; i >= 0; i--) {
    const dialog = modals[i];
    if (dialog?.isConnected && dialog.open) return dialog;
  }
  return undefined;
}

/** Turns the modal simulation on; `restoreModalFocus` turns it off. */
export function simulateModalFocus(): void {
  if (saved) return;
  const dialogProto = HTMLDialogElement.prototype;
  const elementProto = HTMLElement.prototype;
  saved = {
    showModal: Object.getOwnPropertyDescriptor(dialogProto, 'showModal'),
    close: Object.getOwnPropertyDescriptor(dialogProto, 'close'),
    focus: Object.getOwnPropertyDescriptor(elementProto, 'focus'),
  };
  const nativeFocus = elementProto.focus;
  Object.defineProperty(dialogProto, 'showModal', {
    configurable: true,
    writable: true,
    value(this: HTMLDialogElement) {
      this.setAttribute('open', '');
      modals.push(this);
    },
  });
  Object.defineProperty(dialogProto, 'close', {
    configurable: true,
    writable: true,
    value(this: HTMLDialogElement) {
      this.removeAttribute('open');
      const at = modals.indexOf(this);
      if (at >= 0) modals.splice(at, 1);
    },
  });
  Object.defineProperty(elementProto, 'focus', {
    configurable: true,
    writable: true,
    value(this: HTMLElement, options?: FocusOptions) {
      const modal = topModal();
      // Outside the open modal the page is inert: focus does not leave the dialog.
      if (modal && !modal.contains(this)) return;
      nativeFocus.call(this, options);
    },
  });
}

export function restoreModalFocus(): void {
  if (!saved) return;
  const restore = (target: object, key: string, d: PropertyDescriptor | undefined) => {
    if (d) Object.defineProperty(target, key, d);
    else Reflect.deleteProperty(target, key);
  };
  restore(HTMLDialogElement.prototype, 'showModal', saved.showModal);
  restore(HTMLDialogElement.prototype, 'close', saved.close);
  restore(HTMLElement.prototype, 'focus', saved.focus);
  saved = null;
  modals.length = 0;
}

/**
 * Waits for the topmost modal to actually open (open and with focus inside) and returns it.
 * Use it before clicking inside it: `vi.waitFor` on the `<dialog>` in the DOM alone returns
 * too early.
 */
export function openDialog(): Promise<HTMLDialogElement> {
  return vi.waitFor(() => {
    const dialogs = [...document.querySelectorAll('dialog')];
    const dialog = dialogs.at(-1);
    if (!dialog?.open || !dialog.contains(document.activeElement)) {
      throw new Error('the dialog has not opened yet');
    }
    return dialog;
  });
}
