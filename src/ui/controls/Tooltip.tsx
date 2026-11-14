import type { ComponentChildren } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import { tokenValue } from '../../theme/tokens';
import { classes } from './classes';

/** Number of a length token (`--space-2: 8px` → 8). */
function px(token: string): number {
  return Number.parseInt(tokenValue(token, 'light'), 10);
}

/** Minimum gap between the tip and the browser window edge (`--space-2`, same as Popover). */
const EDGE = px('space-2');
/** Space between the control and the tip (`--space-1`). */
const GAP = px('space-1');

export type TooltipPlacement = 'bottom' | 'top' | 'end';

interface TooltipProps {
  /** Texto da dica. */
  readonly label: string;
  /** Atalho mostrado ao lado do texto (ex.: `Ctrl+Z`). */
  readonly shortcut?: string;
  /** `end`: beside the control (side strip), without covering the content next to it. */
  readonly placement?: TooltipPlacement;
  /** Tip pinned open (the `HelpTip` click), even without hover or visible focus. */
  readonly open?: boolean;
  /** Tip suppressed (e.g. the panel the control opens is already on screen and the tip would cover it). */
  readonly suppressed?: boolean;
  /** Called when Esc closes the visible tip; with it, Esc is consumed (does not propagate). */
  readonly onDismiss?: () => void;
  readonly children: ComponentChildren;
}

/**
 * Puts the tip beside the control, vertically centered, inside the browser window: on the
 * right and, if it does not fit, on the left.
 */
function placeEnd(
  tip: HTMLElement,
  box: DOMRect,
  viewport: { readonly width: number; readonly height: number },
): void {
  const width = tip.offsetWidth;
  const height = tip.offsetHeight;
  const right = box.right + GAP;
  const left = right + width <= viewport.width - EDGE ? right : box.left - GAP - width;
  const centered = box.top + box.height / 2 - height / 2;
  const top = Math.max(EDGE, Math.min(centered, viewport.height - height - EDGE));
  tip.style.left = `${Math.max(EDGE, left)}px`;
  tip.style.top = `${top}px`;
}

/**
 * Puts the tip centered below (or above) the control, inside the browser window.
 * The tip is `position: fixed`: out of the flow, it neither widens nor scrolls the panel it is
 * in, and it is not clipped by the panel's edge.
 */
function place(anchor: HTMLElement, placement: TooltipPlacement): void {
  const tip = anchor.querySelector<HTMLElement>(':scope > [data-tooltip]');
  if (!tip) return;
  const box = anchor.getBoundingClientRect();
  const width = tip.offsetWidth;
  const height = tip.offsetHeight;
  const viewport = {
    width: globalThis.innerWidth || document.documentElement.clientWidth,
    height: globalThis.innerHeight || document.documentElement.clientHeight,
  };
  if (placement === 'end') {
    placeEnd(tip, box, viewport);
    return;
  }
  const centered = box.left + box.width / 2 - width / 2;
  const left = Math.max(EDGE, Math.min(centered, viewport.width - width - EDGE));
  const below = box.bottom + GAP;
  const above = box.top - GAP - height;
  const fitsBelow = below + height <= viewport.height - EDGE;
  const top =
    placement === 'bottom'
      ? fitsBelow || above < EDGE
        ? below
        : above
      : above >= EDGE || !fitsBelow
        ? above
        : below;
  tip.style.left = `${left}px`;
  tip.style.top = `${top}px`;
}

/**
 * Tip of a control: appears on mouse hover and on keyboard focus, stays visible while the
 * pointer is over it and goes away with Esc. It is only a visual complement: the accessible
 * name comes from the control's `aria-label` (the tip is `aria-hidden`, but the text stays in
 * the DOM). Hidden, it is out of the flow and takes no space.
 * On touch screens (no hover) it does not appear.
 */
export function Tooltip({
  label,
  shortcut,
  placement = 'bottom',
  open = false,
  suppressed = false,
  onDismiss,
  children,
}: TooltipProps) {
  const [dismissed, setDismissed] = useState(false);
  const anchor = useRef<HTMLSpanElement>(null);
  const show = () => {
    if (anchor.current) place(anchor.current, placement);
  };
  useEffect(() => {
    if (!open) return;
    // Reopening the pinned tip (Enter or click) after an Esc shows it again.
    setDismissed(false);
    if (anchor.current) place(anchor.current, placement);
  }, [open, placement]);
  return (
    <span
      ref={anchor}
      class={classes(
        'tooltip-anchor',
        `tooltip-${placement}`,
        (dismissed || suppressed) && 'tooltip-dismissed',
        open && 'tooltip-open',
      )}
      onKeyDown={(e) => {
        if (e.key !== 'Escape') return;
        const visible = open || !dismissed;
        setDismissed(true);
        // With `onDismiss` (HelpTip), the Esc that closes the tip is consumed: it does not reach
        // the editor shortcuts (clear selection) nor the native `cancel` of a `<dialog>`.
        if (onDismiss && visible) {
          onDismiss();
          e.stopPropagation();
          e.preventDefault();
        }
      }}
      onPointerEnter={show}
      onFocusIn={show}
      onPointerLeave={() => setDismissed(false)}
      onFocusOut={() => setDismissed(false)}
    >
      {children}
      <span class="tooltip" data-tooltip="" aria-hidden="true">
        {label}
        {shortcut && <kbd class="kbd">{shortcut}</kbd>}
      </span>
    </span>
  );
}
