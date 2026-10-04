import type { ComponentChildren } from 'preact';
import { useState } from 'preact/hooks';
import { classes } from './classes';

interface TooltipProps {
  /** Texto da dica. */
  readonly label: string;
  /** Atalho mostrado ao lado do texto (ex.: `Ctrl+Z`). */
  readonly shortcut?: string;
  readonly placement?: 'bottom' | 'top';
  readonly children: ComponentChildren;
}

/**
 * Dica de um controle: aparece ao passar o mouse e ao focar pelo teclado, continua
 * visível enquanto o ponteiro estiver sobre ela e some com Esc. É só um complemento
 * visual: o nome acessível vem do `aria-label` do controle (a dica é `aria-hidden`).
 * Em telas de toque (sem hover) não aparece.
 */
export function Tooltip({
  label,
  shortcut,
  placement = 'bottom',
  children,
}: TooltipProps) {
  const [dismissed, setDismissed] = useState(false);
  return (
    <span
      class={classes(
        'tooltip-anchor',
        `tooltip-${placement}`,
        dismissed && 'tooltip-dismissed',
      )}
      onKeyDown={(e) => {
        if (e.key === 'Escape') setDismissed(true);
      }}
      onPointerLeave={() => setDismissed(false)}
      onFocusOut={() => setDismissed(false)}
    >
      {children}
      <span class="tooltip" aria-hidden="true">
        {label}
        {shortcut && <kbd class="kbd">{shortcut}</kbd>}
      </span>
    </span>
  );
}
