import { useEffect, useRef, useState } from 'preact/hooks';
import { IconButton } from './controls';

// Menu ⋯ de uma linha (KeyValueGrid e DataGrid): subir, descer, remover. Popover
// simples, sem diálogo: fecha com Esc (devolvendo o foco ao botão), com clique fora e
// ao escolher um item. Setas andam entre os itens.

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
}

export function ActionMenu({ label, items, disabled }: ActionMenuProps) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', onDown);
    // Abre com o foco no primeiro item habilitado.
    root.current?.querySelector<HTMLElement>('[role="menuitem"]:not(:disabled)')?.focus();
    return () => document.removeEventListener('pointerdown', onDown);
  }, [open]);

  const close = () => {
    setOpen(false);
    root.current?.querySelector<HTMLElement>('.icon-button')?.focus();
  };

  const onKeyDown = (e: KeyboardEvent) => {
    if (!open) return;
    if (e.key === 'Escape') {
      e.stopPropagation();
      close();
      return;
    }
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    e.preventDefault();
    const enabled = [
      ...(root.current?.querySelectorAll<HTMLElement>(
        '[role="menuitem"]:not(:disabled)',
      ) ?? []),
    ];
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
