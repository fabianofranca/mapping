import type { RefObject } from 'preact';
import { useLayoutEffect } from 'preact/hooks';

// Focus and arrows of popover menus (`ActionMenu` and `MenuPopover`): on open, focus goes
// to the first enabled item; ↑/↓ cycle among the enabled ones; Esc closes. Focus
// returns to the trigger in the caller's `close` (`returnFocusToTrigger`).

const ITEMS = '[role^="menuitem"]:not(:disabled)';

/** Focuses the first enabled item of the menu inside `root`, on open. */
export function useFocusFirstItem(root: RefObject<HTMLElement>, open: boolean): void {
  // In a layout effect: focus counts from the commit that opens the menu.
  useLayoutEffect(() => {
    if (open)
      root.current?.querySelector<HTMLElement>(ITEMS)?.focus({ preventScroll: true });
  }, [open, root]);
}

/** Menu keyboard handler: Esc closes (without bubbling) and ↑/↓ cycle among the items. */
export function menuKeyDown(
  root: RefObject<HTMLElement>,
  open: boolean,
  close: () => void,
): (e: KeyboardEvent) => void {
  return (e) => {
    if (!open) return;
    if (e.key === 'Escape') {
      e.stopPropagation();
      close();
      return;
    }
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    e.preventDefault();
    const enabled = [...(root.current?.querySelectorAll<HTMLElement>(ITEMS) ?? [])];
    const at = enabled.indexOf(document.activeElement as HTMLElement);
    const step = e.key === 'ArrowDown' ? 1 : -1;
    enabled[(at + step + enabled.length) % enabled.length]?.focus();
  };
}
