import type { ComponentChildren } from 'preact';
import { useLayoutEffect, useRef, useState } from 'preact/hooks';
import { FOCUSABLE, returnFocusToTrigger } from './focus';

// Popover ancorado num botão (paleta de cor e ações da linha da janela Camadas). Fica em
// `position: fixed`, então não é cortado pela rolagem da janela onde está. Fecha com Esc,
// ao escolher, com clique fora, ao rolar ou ao redimensionar; em todo fechamento, o foco
// que estava nele volta ao botão (etapa 8, F6). Sem API nova do navegador: funciona em
// `file://`.

/** Folga mínima entre o popover e a borda da janela do navegador. */
const EDGE = 8;
/** Espaço entre o botão e o popover. */
const GAP = 4;

interface PopoverState {
  readonly open: boolean;
  readonly toggle: () => void;
}

interface PopoverProps {
  readonly class?: string;
  /** Papel do painel: `menu` para lista de ações, `dialog` para conteúdo livre. */
  readonly role?: 'menu' | 'dialog';
  /** Nome acessível do painel. */
  readonly label: string;
  /** Lado do botão com que o painel alinha a borda: `end` para botões no fim da linha. */
  readonly align?: 'start' | 'end';
  /** O botão que abre o popover. */
  readonly trigger: (state: PopoverState) => ComponentChildren;
  /** Conteúdo; a função recebe `close` para fechar ao escolher algo. */
  readonly children: ComponentChildren | ((close: () => void) => ComponentChildren);
}

/** Posiciona o painel embaixo do botão, ou em cima se não couber, sempre dentro da janela. */
function place(host: HTMLElement, panel: HTMLElement, align: 'start' | 'end'): void {
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
  const top =
    below + height <= viewport.height - EDGE
      ? below
      : Math.max(EDGE, anchor.top - GAP - height);
  panel.style.left = `${left}px`;
  panel.style.top = `${top}px`;
}

export function Popover({
  class: extra,
  role = 'dialog',
  label,
  align = 'start',
  trigger,
  children,
}: PopoverProps) {
  const [open, setOpen] = useState(false);
  const host = useRef<HTMLSpanElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  /** O botão que abre: o primeiro controle do host fora do painel. */
  const triggerEl = () =>
    [...(host.current?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? [])].find(
      (el) => !panel.current?.contains(el),
    );
  const close = () => {
    returnFocusToTrigger(host.current, triggerEl());
    setOpen(false);
  };

  useLayoutEffect(() => {
    if (open && host.current && panel.current) place(host.current, panel.current, align);
  }, [open, align]);

  // Em layout effect: o clique fora vale desde o commit que abre o popover.
  useLayoutEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!host.current?.contains(e.target as Node)) close();
    };
    const onScroll = (e: Event) => {
      // Rolar o próprio popover (paleta longa) não fecha.
      if (!panel.current?.contains(e.target as Node)) close();
    };
    document.addEventListener('pointerdown', onDown);
    document.addEventListener('scroll', onScroll, true);
    globalThis.addEventListener('resize', close);
    return () => {
      document.removeEventListener('pointerdown', onDown);
      document.removeEventListener('scroll', onScroll, true);
      globalThis.removeEventListener('resize', close);
    };
    // `close` só lê refs e escreve no estado.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  return (
    <span
      class={extra ? `popover-host ${extra}` : 'popover-host'}
      ref={host}
      onKeyDown={(e) => {
        if (e.key !== 'Escape' || !open) return;
        e.stopPropagation();
        close();
      }}
    >
      {trigger({ open, toggle: () => setOpen(!open) })}
      {open && (
        <div class="popover" role={role} aria-label={label} ref={panel}>
          {typeof children === 'function' ? children(close) : children}
        </div>
      )}
    </span>
  );
}
