import type { ComponentChildren, JSX } from 'preact';
import { classes } from './classes';

type NativeButton = Omit<
  JSX.ButtonHTMLAttributes<HTMLButtonElement>,
  'class' | 'size' | 'children'
>;

interface ChipProps extends NativeButton {
  /** Filter on (`aria-pressed`). */
  readonly pressed: boolean;
  readonly children: ComponentChildren;
  /** Count beside the label (e.g. "Only conflicts 3"). */
  readonly count?: number;
}

/**
 * Filter chip (DS 2.0 Chip): compact 24px toggle, with an
 * optional count. Used in the review filters (change type, only conflicts).
 */
export function Chip({ pressed, children, count, type = 'button', ...rest }: ChipProps) {
  return (
    <button {...rest} type={type} class={classes('chip')} aria-pressed={pressed}>
      {children}
      {count !== undefined && <span class="chip-count">{count}</span>}
    </button>
  );
}
