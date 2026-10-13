import type { Ref } from 'preact';
import { useLayoutEffect, useRef, useState } from 'preact/hooks';
import { IconButton } from './controls';
import { assignRef, returnFocusToTrigger } from './focus';

// Menu ⋯ de uma linha (KeyValueGrid e DataGrid): subir, descer, remover. Popover
// simples, sem diálogo: fecha com Esc, com clique fora e ao escolher um item, e em todo
// fechamento o foco que estava nele volta ao botão (etapa 8, F6). Setas andam entre os itens.

export interface ActionMenuItem {
  readonly label: string;
  readonly onSelect: () => void;
  readonly disabled?: boolean;
  readonly danger?: boolean;
}

interface ActionMenuProps {
  /** Nome acessível do botão (ex.: "Ações do par"). */
  readonly label: string;
  readonly items: readonly ActionMenuItem[];
  readonly disabled?: boolean;
  /** O botão que abre o menu (ex.: alvo do foco depois de um diálogo aberto pelo item). */
  readonly triggerRef?: Ref<HTMLButtonElement>;
}

const ITEMS = '[role="menuitem"]:not(:disabled)';

export function ActionMenu({ label, items, disabled, triggerRef }: ActionMenuProps) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLSpanElement>(null);
  const trigger = useRef<HTMLButtonElement | null>(null);

  const close = () => {
    returnFocusToTrigger(root.current, trigger.current);
    setOpen(false);
  };

  // Em layout effect: o foco e o clique fora valem desde o commit que abre o menu.
  useLayoutEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) close();
    };
    document.addEventListener('pointerdown', onDown);
    // Abre com o foco no primeiro item habilitado.
    root.current?.querySelector<HTMLElement>(ITEMS)?.focus();
    return () => document.removeEventListener('pointerdown', onDown);
  }, [open]);

  const onKeyDown = (e: KeyboardEvent) => {
    if (!open) return;
    if (e.key === 'Escape') {
      e.stopPropagation();
      close();
      return;
    }
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    e.preventDefault();
    const enabled = [...(root.current?.querySelectorAll<HTMLElement>(ITEMS) ?? [])];
    const at = enabled.indexOf(document.activeElement as HTMLElement);
    const step = e.key === 'ArrowDown' ? 1 : -1;
    enabled[(at + step + enabled.length) % enabled.length]?.focus();
  };

  return (
    <span class="action-menu" ref={root} onKeyDown={onKeyDown}>
      <IconButton
        icon="moreVertical"
        label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        disabled={disabled}
        buttonRef={(el) => {
          trigger.current = el;
          assignRef(triggerRef, el);
        }}
        onClick={() => setOpen(!open)}
      />
      {open && (
        <span class="action-menu-list" role="menu" aria-label={label}>
          {items.map((item) => (
            <button
              key={item.label}
              type="button"
              role="menuitem"
              class={item.danger ? 'action-menu-item danger' : 'action-menu-item'}
              disabled={item.disabled}
              onClick={() => {
                close();
                item.onSelect();
              }}
            >
              {item.label}
            </button>
          ))}
        </span>
      )}
    </span>
  );
}
