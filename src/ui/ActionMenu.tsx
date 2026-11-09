import type { Ref } from 'preact';
import { useLayoutEffect, useRef, useState } from 'preact/hooks';
import { IconButton } from './controls';
import { assignRef, returnFocusToTrigger } from './focus';
import { createOpenScrollGuard } from './openScrollGuard';
import { place } from './Popover';
import { menuKeyDown, useFocusFirstItem } from './useMenuNavigation';

// Menu ⋯ de uma linha (KeyValueGrid e DataGrid): subir, descer, remover. Popover
// simples, sem diálogo: fecha com Esc, com clique fora e ao escolher um item, e em todo
// fechamento o foco que estava nele volta ao botão (etapa 8, F6). Setas andam entre os itens.

export interface ActionMenuItem {
  readonly label: string;
  readonly onSelect: () => void;
  readonly disabled?: boolean;
  /** Dica do item, em especial a de por que ele está desabilitado. */
  readonly title?: string;
  readonly danger?: boolean;
  /** O item que marca onde se está (`aria-current`), como o último trecho do caminho. */
  readonly current?: boolean;
}

interface ActionMenuProps {
  /** Nome acessível do botão (ex.: "Ações do par"). */
  readonly label: string;
  readonly items: readonly ActionMenuItem[];
  readonly disabled?: boolean;
  /** Ícone do botão; o padrão é o ⋯ vertical das linhas. */
  readonly icon?: 'moreVertical' | 'more';
  /** Nome do menu aberto, se for outro que o do botão. */
  readonly menuLabel?: string;
  /** Classe extra da raiz (o CSS que mostra ou esconde o menu inteiro). */
  readonly className?: string;
  /** O botão que abre o menu (ex.: alvo do foco depois de um diálogo aberto pelo item). */
  readonly triggerRef?: Ref<HTMLButtonElement>;
}

export function ActionMenu({
  label,
  items,
  disabled,
  icon = 'moreVertical',
  menuLabel,
  className,
  triggerRef,
}: ActionMenuProps) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLSpanElement>(null);
  const trigger = useRef<HTMLButtonElement | null>(null);
  const list = useRef<HTMLSpanElement>(null);

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
    // Fechar ao rolar (qualquer ancestral, em captura) ou redimensionar: a lista é fixa.
    // A rolagem que a própria abertura provoca não conta (openScrollGuard).
    const scrollCloses = createOpenScrollGuard(() => trigger.current);
    const onScroll = (e: Event) => {
      if (scrollCloses(e)) close();
    };
    const onMove = () => close();
    if (list.current && trigger.current) place(trigger.current, list.current, 'end');
    document.addEventListener('pointerdown', onDown);
    document.addEventListener('scroll', onScroll, true);
    globalThis.addEventListener('resize', onMove);
    return () => {
      document.removeEventListener('pointerdown', onDown);
      document.removeEventListener('scroll', onScroll, true);
      globalThis.removeEventListener('resize', onMove);
    };
  }, [open]);

  useFocusFirstItem(root, open);
  const onKeyDown = menuKeyDown(root, open, close);

  return (
    <span
      class={className ? `action-menu ${className}` : 'action-menu'}
      ref={root}
      onKeyDown={onKeyDown}
    >
      <IconButton
        icon={icon}
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
        <span
          class="action-menu-list"
          role="menu"
          aria-label={menuLabel ?? label}
          ref={list}
        >
          {items.map((item, i) => (
            <button
              key={i}
              type="button"
              role="menuitem"
              class={item.danger ? 'action-menu-item danger' : 'action-menu-item'}
              disabled={item.disabled}
              title={item.title}
              aria-current={item.current ? 'location' : undefined}
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
