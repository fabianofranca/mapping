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
const GAP = 4;
const EDGE = 8;

/** Põe a lista (fixed) abaixo do gatilho, alinhada à direita; sobe se não couber. */
function place(list: HTMLElement, anchor: HTMLElement): void {
  const box = anchor.getBoundingClientRect();
  const width = list.offsetWidth;
  const height = list.offsetHeight;
  const vw = globalThis.innerWidth || document.documentElement.clientWidth;
  const vh = globalThis.innerHeight || document.documentElement.clientHeight;
  const left = Math.max(EDGE, Math.min(box.right - width, vw - width - EDGE));
  const below = box.bottom + GAP;
  const above = box.top - GAP - height;
  const fitsBelow = below + height <= vh - EDGE;
  const top = fitsBelow || above < EDGE ? below : above;
  list.style.left = `${left}px`;
  list.style.top = `${Math.max(EDGE, Math.min(top, vh - height - EDGE))}px`;
}

export function ActionMenu({ label, items, disabled, triggerRef }: ActionMenuProps) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLSpanElement>(null);
  const trigger = useRef<HTMLButtonElement | null>(null);
  const list = useRef<HTMLSpanElement>(null);

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
    // Fechar ao rolar (qualquer ancestral, em captura) ou redimensionar: a lista é fixa.
    const onMove = () => close();
    if (list.current && trigger.current) place(list.current, trigger.current);
    document.addEventListener('pointerdown', onDown);
    document.addEventListener('scroll', onMove, true);
    globalThis.addEventListener('resize', onMove);
    // Abre com o foco no primeiro item habilitado.
    root.current?.querySelector<HTMLElement>(ITEMS)?.focus({ preventScroll: true });
    return () => {
      document.removeEventListener('pointerdown', onDown);
      document.removeEventListener('scroll', onMove, true);
      globalThis.removeEventListener('resize', onMove);
    };
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
        <span class="action-menu-list" role="menu" aria-label={label} ref={list}>
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
