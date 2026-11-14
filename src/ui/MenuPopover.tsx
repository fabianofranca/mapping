import type { ComponentChildren } from 'preact';
import { useLayoutEffect, useRef, useState } from 'preact/hooks';
import { returnFocusToTrigger } from './focus';
import { Icon } from './icons';
import { menuKeyDown, useFocusFirstItem } from './useMenuNavigation';

// Popover menu (the "project ▾" of the main bar). It does not use a dialog: closes with Esc,
// on click outside and on choosing an item, and works on `file://` (no new API). On every
// close, the focus that was on the menu returns to the button (stage 8, F6).

interface MenuPopoverProps {
  /** Text of the button that opens the menu. */
  readonly label: string;
  /** Accessible name of the button: starts with the visible text (WCAG 2.5.3), e.g. "Bulk: …". */
  readonly buttonLabel?: string;
  readonly class?: string;
  /** Menu items (buttons with `role="menuitem"`); a click on any of them closes the popover. */
  readonly children: ComponentChildren;
}

export function MenuPopover({
  label,
  buttonLabel,
  class: extra,
  children,
}: MenuPopoverProps) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);

  const close = () => {
    returnFocusToTrigger(root.current, trigger.current);
    setOpen(false);
  };

  // In a layout effect: the outside click counts from the commit that opens the menu.
  useLayoutEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) close();
    };
    document.addEventListener('pointerdown', onDown);
    return () => document.removeEventListener('pointerdown', onDown);
  }, [open]);

  useFocusFirstItem(root, open);

  return (
    <div
      class={extra ? `menu-popover ${extra}` : 'menu-popover'}
      ref={root}
      onKeyDown={menuKeyDown(root, open, close)}
    >
      <button
        ref={trigger}
        type="button"
        class="menu-trigger"
        aria-label={buttonLabel}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        <span class="menu-trigger-text">{label}</span>
        <Icon name="chevronDown" />
      </button>
      {open && (
        // Closes on capture, before the click reaches the item: focus is already on the trigger
        // when the item acts (a dialog opened by it keeps the trigger as its opener).
        // The list only leaves on the next render, so the item still receives the click.
        <div class="menu-list" role="menu" onClickCapture={close}>
          {children}
        </div>
      )}
    </div>
  );
}
