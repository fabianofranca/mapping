import type { Ref } from 'preact';
import { useLayoutEffect, useRef, useState } from 'preact/hooks';
import { Icon } from './icons';
import { IconButton } from './controls';
import { assignRef, returnFocusToTrigger } from './focus';
import { createOpenScrollGuard } from './openScrollGuard';
import { place } from './Popover';
import { menuKeyDown, useFocusFirstItem } from './useMenuNavigation';

// Row ⋯ menu (KeyValueGrid and DataGrid): move up, move down, remove. Simple
// popover, no dialog: closes on Esc, on an outside click and on choosing an item, and on every
// close the focus that was inside returns to the button (stage 8, F6). Arrows move between
// the items.

export interface ActionMenuItem {
  readonly label: string;
  readonly onSelect: () => void;
  readonly disabled?: boolean;
  /** Hint for the item, especially why it is disabled. */
  readonly title?: string;
  readonly danger?: boolean;
  /** The item that marks where one is (`aria-current`), like the last segment of a path. */
  readonly current?: boolean;
  /** Liga/desliga: o item vira `menuitemcheckbox` e mostra o estado marcado. */
  readonly checked?: boolean;
  /** Shortcut, to the right of the text. */
  readonly shortcut?: string;
}

interface ActionMenuProps {
  /** Accessible name of the button (e.g. "Pair actions"). */
  readonly label: string;
  readonly items: readonly ActionMenuItem[];
  readonly disabled?: boolean;
  /** Icon of the button; the default is the vertical ⋯ of the rows. */
  readonly icon?: 'moreVertical' | 'more';
  /** Name of the open menu, if different from the button's. */
  readonly menuLabel?: string;
  /** Extra class of the root (the CSS that shows or hides the whole menu). */
  readonly className?: string;
  /** The button that opens the menu (e.g. focus target after a dialog opened by the item). */
  readonly triggerRef?: Ref<HTMLButtonElement>;
  /** Badge and alert dot on the button (e.g. the thread count in an overflow menu). */
  readonly badge?: string;
  readonly alert?: boolean;
}

export function ActionMenu({
  label,
  items,
  disabled,
  icon = 'moreVertical',
  menuLabel,
  className,
  triggerRef,
  badge,
  alert,
}: ActionMenuProps) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLSpanElement>(null);
  const trigger = useRef<HTMLButtonElement | null>(null);
  const list = useRef<HTMLSpanElement>(null);

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
    // Close on scroll (any ancestor, in capture) or resize: the list is fixed.
    // The scroll that the opening itself causes does not count (openScrollGuard).
    const scrollCloses = createOpenScrollGuard(() => trigger.current);
    const onScroll = (e: Event) => {
      if (scrollCloses(e)) close();
    };
    const onMove = () => close();
    if (list.current && trigger.current) place(trigger.current, list.current, 'end');
    document.addEventListener('pointerdown', onDown);
    document.addEventListener('scroll', onScroll, true);
    globalThis.addEventListener('resize', onMove);
    return () => {
      document.removeEventListener('pointerdown', onDown);
      document.removeEventListener('scroll', onScroll, true);
      globalThis.removeEventListener('resize', onMove);
    };
  }, [open]);

  useFocusFirstItem(root, open);
  const onKeyDown = menuKeyDown(root, open, close);

  return (
    <span
      class={className ? `action-menu ${className}` : 'action-menu'}
      ref={root}
      onKeyDown={onKeyDown}
    >
      <IconButton
        icon={icon}
        label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        disabled={disabled}
        {...(badge ? { badge } : {})}
        alert={alert}
        buttonRef={(el) => {
          trigger.current = el;
          assignRef(triggerRef, el);
        }}
        onClick={() => setOpen(!open)}
      />
      {open && (
        <span
          class="action-menu-list"
          role="menu"
          aria-label={menuLabel ?? label}
          ref={list}
        >
          {items.map((item, i) => (
            <button
              key={i}
              type="button"
              role={item.checked === undefined ? 'menuitem' : 'menuitemcheckbox'}
              aria-checked={item.checked}
              class={item.danger ? 'action-menu-item danger' : 'action-menu-item'}
              disabled={item.disabled}
              title={item.title}
              aria-current={item.current ? 'location' : undefined}
              onClick={() => {
                close();
                item.onSelect();
              }}
            >
              {item.checked !== undefined && (
                <span class="action-menu-check" aria-hidden="true">
                  {item.checked && <Icon name="check" />}
                </span>
              )}
              {item.label}
              {item.shortcut && <kbd class="action-menu-shortcut">{item.shortcut}</kbd>}
            </button>
          ))}
        </span>
      )}
    </span>
  );
}
