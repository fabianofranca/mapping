import type { ComponentChildren } from 'preact';
import { useRef, useState } from 'preact/hooks';
import { classes } from './classes';

/** Folga mínima entre a dica e a borda da janela do navegador (a mesma do Popover). */
const EDGE = 8;
/** Espaço entre o controle e a dica (`--space-1`). */
const GAP = 4;

interface TooltipProps {
  /** Texto da dica. */
  readonly label: string;
  /** Atalho mostrado ao lado do texto (ex.: `Ctrl+Z`). */
  readonly shortcut?: string;
  readonly placement?: 'bottom' | 'top';
  readonly children: ComponentChildren;
}

/**
 * Põe a dica centrada embaixo (ou em cima) do controle, dentro da janela do navegador.
 * A dica é `position: fixed`: fora do fluxo, não alarga nem rola o painel onde está e
 * não é cortada pela borda dele.
 */
function place(anchor: HTMLElement, placement: 'bottom' | 'top'): void {
  const tip = anchor.querySelector<HTMLElement>(':scope > .tooltip');
  if (!tip) return;
  const box = anchor.getBoundingClientRect();
  const width = tip.offsetWidth;
  const height = tip.offsetHeight;
  const viewport = {
    width: globalThis.innerWidth || document.documentElement.clientWidth,
    height: globalThis.innerHeight || document.documentElement.clientHeight,
  };
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
 * Dica de um controle: aparece ao passar o mouse e ao focar pelo teclado, continua
 * visível enquanto o ponteiro estiver sobre ela e some com Esc. É só um complemento
 * visual: o nome acessível vem do `aria-label` do controle (a dica é `aria-hidden`, mas
 * o texto continua no DOM). Oculta, fica fora do fluxo e não ocupa espaço.
 * Em telas de toque (sem hover) não aparece.
 */
export function Tooltip({
  label,
  shortcut,
  placement = 'bottom',
  children,
}: TooltipProps) {
  const [dismissed, setDismissed] = useState(false);
  const anchor = useRef<HTMLSpanElement>(null);
  const show = () => {
    if (anchor.current) place(anchor.current, placement);
  };
  return (
    <span
      ref={anchor}
      class={classes(
        'tooltip-anchor',
        `tooltip-${placement}`,
        dismissed && 'tooltip-dismissed',
      )}
      onKeyDown={(e) => {
        if (e.key === 'Escape') setDismissed(true);
      }}
      onPointerEnter={show}
      onFocusIn={show}
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
