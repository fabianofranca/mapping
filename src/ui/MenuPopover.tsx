import type { ComponentChildren } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import { Icon } from './icons';

// Menu em popover (o "projeto ▾" da barra principal). Não usa diálogo: fecha com Esc,
// com clique fora e ao escolher um item, e funciona em `file://` (sem API nova).

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

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
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
          setOpen(false);
          root.current?.querySelector<HTMLElement>('button')?.focus();
        }
      }}
    >
      <button
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
        <div class="menu-list" role="menu" onClick={() => setOpen(false)}>
          {children}
        </div>
      )}
    </div>
  );
}
