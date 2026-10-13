import type { ComponentChildren } from 'preact';
import { useLayoutEffect, useRef, useState } from 'preact/hooks';
import { returnFocusToTrigger } from './focus';
import { Icon } from './icons';

// Menu em popover (o "projeto ▾" da barra principal). Não usa diálogo: fecha com Esc,
// com clique fora e ao escolher um item, e funciona em `file://` (sem API nova). Em todo
// fechamento, o foco que estava no menu volta ao botão (etapa 8, F6).

interface MenuPopoverProps {
  /** Texto do botão que abre o menu. */
  readonly label: string;
  /** Nome acessível do botão (quando o texto visível não basta). */
  readonly buttonLabel?: string;
  readonly class?: string;
  /** Itens do menu (botões); o clique em qualquer um fecha o popover. */
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

  // Em layout effect: o clique fora vale desde o commit que abre o menu.
  useLayoutEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) close();
    };
    document.addEventListener('pointerdown', onDown);
    return () => document.removeEventListener('pointerdown', onDown);
  }, [open]);

  return (
    <div
      class={extra ? `menu-popover ${extra}` : 'menu-popover'}
      ref={root}
      onKeyDown={(e) => {
        if (e.key === 'Escape' && open) {
          e.stopPropagation();
          close();
        }
      }}
    >
      <button
        ref={trigger}
        type="button"
        class="menu-trigger"
        aria-label={buttonLabel}
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        <span class="menu-trigger-text">{label}</span>
        <Icon name="chevronDown" />
      </button>
      {open && (
        // Fecha na captura, antes de o clique chegar ao item: o foco já está no gatilho
        // quando o item age (um diálogo aberto por ele guarda o gatilho como quem o abriu).
        // A lista só sai na renderização seguinte, então o item ainda recebe o clique.
        <div class="menu-list" role="menu" onClickCapture={close}>
          {children}
        </div>
      )}
    </div>
  );
}
