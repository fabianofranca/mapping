import type { ComponentChildren, RefObject } from 'preact';
import { useLayoutEffect, useRef, useState } from 'preact/hooks';
import { FOCUSABLE, returnFocusToTrigger } from './focus';
import { createOpenScrollGuard } from './openScrollGuard';
import { menuKeyDown, useFocusFirstItem } from './useMenuNavigation';

// Popover anchored to a button (color palette and row actions of the Layers window). It stays in
// `position: fixed`, so it is not clipped by the scrolling of the window it sits in. It closes
// on Esc, on choosing, on an outside click, on scroll or on resize; on every close, the focus
// that was inside it returns to the button (stage 8, F6). No new browser API: it works on
// `file://`.

/** Minimum gap between the popover and the browser window edge. */
const EDGE = 8;
/** Space between the button and the popover. */
const GAP = 4;

interface PopoverState {
  readonly open: boolean;
  readonly toggle: () => void;
}

interface PopoverProps {
  readonly class?: string;
  /** Role of the panel: `menu` for a list of actions, `dialog` for free content. */
  readonly role?: 'menu' | 'dialog';
  /** Accessible name of the panel. */
  readonly label: string;
  /** Side of the button the panel aligns its edge to: `end` for buttons at the end of a row. */
  readonly align?: 'start' | 'end';
  /** The button that opens the popover. */
  readonly trigger: (state: PopoverState) => ComponentChildren;
  /**
   * Controlled: the caller says whether it is open and receives the open and close requests (the
   * review marker opens on hover and on focus, and only one is open at a time). Without
   * `open`, the popover keeps its own state, as always.
   */
  readonly open?: boolean;
  readonly onOpenChange?: (open: boolean) => void;
  /** `id` of the panel (for the trigger's `aria-controls`). */
  readonly id?: string;
  /** Extra class of the panel (the host's is `class`). */
  readonly panelClass?: string;
  /**
   * Page scroll (outside the panel): `close` closes (default); `follow` repositions, so a
   * popover opened by focus does not close on the scroll that brings the trigger into view.
   */
  readonly scroll?: 'close' | 'follow';
  /** Limit read at every positioning (e.g. the bottom of the review bar); `null`: no limit. */
  readonly limit?: () => PlaceLimit | null;
  /**
   * Element the panel anchors to, instead of the host (whose own is hidden); read at every
   * positioning.
   */
  readonly anchor?: () => HTMLElement | null | undefined;
  /** Content; the function receives `close` to close on choosing something. */
  readonly children: ComponentChildren | ((close: () => void) => ComponentChildren);
}

/** Optional limit of the panel: the panel does not rise above `top` (window coordinates). */
export interface PlaceLimit {
  readonly top: number;
}

/**
 * With a limit: below if it fits; otherwise above, under the limit; otherwise on the side
 * with more room, with a maximum height and inner scrolling.
 */
function placeLimited(
  panel: HTMLElement,
  anchor: DOMRect,
  height: number,
  floor: number,
  viewportHeight: number,
): number {
  const ceiling = Math.max(EDGE, floor + GAP);
  const below = anchor.bottom + GAP;
  const spaceBelow = viewportHeight - EDGE - below;
  const spaceAbove = anchor.top - GAP - ceiling;
  if (height <= spaceBelow) return below;
  if (height <= spaceAbove) return anchor.top - GAP - height;
  const useBelow = spaceBelow >= spaceAbove;
  const room = Math.max(0, useBelow ? spaceBelow : spaceAbove);
  panel.style.maxHeight = `${room}px`;
  panel.style.overflowY = 'auto';
  return useBelow ? below : anchor.top - GAP - room;
}

/**
 * Positions the panel below the button, or above if it does not fit, always inside the window.
 * `limit`: the panel also does not invade the area above it (the review bar).
 */
export function place(
  host: HTMLElement,
  panel: HTMLElement,
  align: 'start' | 'end',
  limit?: PlaceLimit | null,
): void {
  if (limit) {
    panel.style.maxHeight = '';
    panel.style.overflowY = '';
  }
  const anchor = host.getBoundingClientRect();
  const width = panel.offsetWidth;
  const height = panel.offsetHeight;
  const viewport = {
    width: globalThis.innerWidth || document.documentElement.clientWidth,
    height: globalThis.innerHeight || document.documentElement.clientHeight,
  };
  const wanted = align === 'end' ? anchor.right - width : anchor.left;
  const left = Math.max(EDGE, Math.min(wanted, viewport.width - width - EDGE));
  const below = anchor.bottom + GAP;
  const top = limit
    ? placeLimited(panel, anchor, height, limit.top, viewport.height)
    : below + height <= viewport.height - EDGE
      ? below
      : Math.max(EDGE, anchor.top - GAP - height);
  panel.style.left = `${left}px`;
  panel.style.top = `${top}px`;
}

/**
 * Popover keyboard. With `role="menu"`, the menu pattern (focus on the first enabled
 * item, ↑/↓ cycle, Esc closes), with the logic of `MenuPopover` and `ActionMenu`;
 * for the others, only Esc.
 */
function usePopoverKeys(
  panel: RefObject<HTMLElement>,
  open: boolean,
  isMenu: boolean,
  close: () => void,
): (e: KeyboardEvent) => void {
  useFocusFirstItem(panel, open && isMenu);
  const menuKeys = menuKeyDown(panel, open && isMenu, close);
  return (e) => {
    if (isMenu) return menuKeys(e);
    if (e.key !== 'Escape' || !open) return;
    e.stopPropagation();
    close();
  };
}

export function Popover({
  class: extra,
  role = 'dialog',
  label,
  align = 'start',
  trigger,
  open: controlledOpen,
  onOpenChange,
  id,
  panelClass,
  scroll = 'close',
  limit,
  anchor,
  children,
}: PopoverProps) {
  const [ownOpen, setOwnOpen] = useState(false);
  const controlled = controlledOpen !== undefined;
  const open = controlled ? controlledOpen : ownOpen;
  const setOpen = (next: boolean) => {
    if (controlled) onOpenChange?.(next);
    else setOwnOpen(next);
  };
  const host = useRef<HTMLSpanElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  /** The button that opens: the first control of the host outside the panel. */
  const triggerEl = () =>
    [...(host.current?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? [])].find(
      (el) => !panel.current?.contains(el),
    );
  /** Where the panel anchors: the outer `anchor` (a button that replaces it) or the host. */
  const anchorEl = () => anchor?.() ?? host.current;
  const close = () => {
    returnFocusToTrigger(host.current, triggerEl());
    setOpen(false);
  };

  useLayoutEffect(() => {
    const at = anchorEl();
    if (open && at && panel.current) place(at, panel.current, align, limit?.());
    // `limit` is read at every positioning, it is not a dependency.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, align]);

  const onKeyDown = usePopoverKeys(panel, open, role === 'menu', close);

  // In a layout effect: the outside click counts from the commit that opens the popover.
  useLayoutEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!host.current?.contains(e.target as Node)) close();
    };
    const scrollCounts = createOpenScrollGuard(triggerEl);
    const onScroll = (e: Event) => {
      // Scrolling the popover itself (long palette) does not close it; neither does the
      // opening scroll.
      if (panel.current?.contains(e.target as Node)) return;
      if (scroll === 'close') {
        if (scrollCounts(e)) close();
      } else if (anchorEl() && panel.current)
        place(anchorEl()!, panel.current, align, limit?.());
    };
    document.addEventListener('pointerdown', onDown);
    document.addEventListener('scroll', onScroll, true);
    globalThis.addEventListener('resize', close);
    return () => {
      document.removeEventListener('pointerdown', onDown);
      document.removeEventListener('scroll', onScroll, true);
      globalThis.removeEventListener('resize', close);
    };
    // `close` only reads refs and writes state (or notifies the controlling caller).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, scroll, align]);

  return (
    <span
      class={extra ? `popover-host ${extra}` : 'popover-host'}
      ref={host}
      onKeyDown={onKeyDown}
    >
      {trigger({ open, toggle: () => setOpen(!open) })}
      {open && (
        <div
          class={panelClass ? `popover ${panelClass}` : 'popover'}
          id={id}
          role={role}
          aria-label={label}
          ref={panel}
        >
          {typeof children === 'function' ? children(close) : children}
        </div>
      )}
    </span>
  );
}
