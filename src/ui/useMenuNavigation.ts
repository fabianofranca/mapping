import type { RefObject } from 'preact';
import { useLayoutEffect } from 'preact/hooks';

// Foco e setas dos menus em popover (`ActionMenu` e `MenuPopover`): ao abrir, o foco vai
// ao primeiro item habilitado; ↑/↓ andam em círculo entre os habilitados; Esc fecha. O
// foco volta ao gatilho em `close` de quem usa (`returnFocusToTrigger`).

const ITEMS = '[role^="menuitem"]:not(:disabled)';

/** Foca o primeiro item habilitado do menu dentro de `root`, ao abrir. */
export function useFocusFirstItem(root: RefObject<HTMLElement>, open: boolean): void {
  // Em layout effect: o foco vale desde o commit que abre o menu.
  useLayoutEffect(() => {
    if (open)
      root.current?.querySelector<HTMLElement>(ITEMS)?.focus({ preventScroll: true });
  }, [open, root]);
}

/** Tratador de teclado do menu: Esc fecha (sem borbulhar) e ↑/↓ circulam entre os itens. */
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
