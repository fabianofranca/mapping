import type { ComponentChildren, JSX } from 'preact';
import { classes } from './classes';

type NativeButton = Omit<
  JSX.ButtonHTMLAttributes<HTMLButtonElement>,
  'class' | 'size' | 'children'
>;

interface ChipProps extends NativeButton {
  /** Filtro ligado (`aria-pressed`). */
  readonly pressed: boolean;
  readonly children: ComponentChildren;
  /** Contagem ao lado do rótulo (ex.: "Só conflitos 3"). */
  readonly count?: number;
}

/**
 * Chip de filtro (Chip do DS 2.0): alternância compacta de 24px (44px no celular), com
 * contagem opcional. Usado nos filtros da revisão (tipo de mudança, só conflitos).
 */
export function Chip({ pressed, children, count, type = 'button', ...rest }: ChipProps) {
  return (
    <button {...rest} type={type} class={classes('chip')} aria-pressed={pressed}>
      {children}
      {count !== undefined && <span class="chip-count">{count}</span>}
    </button>
  );
}
