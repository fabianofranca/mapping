import type { JSX } from 'preact';
import { useLayoutEffect, useRef } from 'preact/hooks';
import { Icon, type IconName } from '../icons';

export interface TabItem<T extends string> {
  readonly id: T;
  readonly label: string;
  /** Ícone antes do rótulo. */
  readonly icon?: IconName;
  /** Dica nativa (`title`). */
  readonly title?: string;
  readonly disabled?: boolean;
  /** Contador ao lado do rótulo (ex.: quantas pendências). */
  readonly badge?: string;
  /** `info`: contador que avisa uma novidade (ex.: propostas novas), em destaque. */
  readonly badgeTone?: 'muted' | 'info';
  /** Ponto de alerta ao lado do rótulo (ex.: erro novo). */
  readonly alert?: boolean;
}

interface TabsProps<T extends string> {
  readonly tabs: readonly TabItem<T>[];
  readonly value: T;
  readonly onChange: (id: T) => void;
  /** Nome acessível da lista de abas. */
  readonly label: string;
}

/**
 * Abas com sublinhado (2px). Setas, Home e End movem entre
 * as abas (o foco e a seleção andam juntos); só a aba escolhida entra na ordem do Tab.
 */
export function Tabs<T extends string>({
  tabs,
  value,
  onChange,
  label,
}: TabsProps<T>): JSX.Element {
  const listRef = useRef<HTMLDivElement>(null);
  // Lista que rola (janela estreita): a aba escolhida nunca fica fora da faixa visível.
  useLayoutEffect(() => {
    const list = listRef.current;
    const tab = list?.querySelector<HTMLElement>('[role="tab"][aria-selected="true"]');
    if (!list || !tab) return;
    const left = tab.offsetLeft - list.offsetLeft;
    const right = left + tab.offsetWidth;
    if (left < list.scrollLeft) list.scrollLeft = left;
    else if (right > list.scrollLeft + list.clientWidth)
      list.scrollLeft = right - list.clientWidth;
  }, [value, tabs.length]);

  const move = (e: KeyboardEvent, from: number) => {
    const enabled = tabs.map((tab, i) => (tab.disabled ? -1 : i)).filter((i) => i >= 0);
    const at = enabled.indexOf(from);
    let next: number | undefined;
    if (e.key === 'ArrowRight') next = enabled[(at + 1) % enabled.length];
    else if (e.key === 'ArrowLeft')
      next = enabled[(at - 1 + enabled.length) % enabled.length];
    else if (e.key === 'Home') next = enabled[0];
    else if (e.key === 'End') next = enabled[enabled.length - 1];
    const tab = next === undefined ? undefined : tabs[next];
    if (!tab) return;
    e.preventDefault();
    onChange(tab.id);
    const list = (e.currentTarget as HTMLElement).parentElement;
    list?.querySelectorAll<HTMLElement>('[role="tab"]')[next ?? 0]?.focus();
  };

  return (
    <div ref={listRef} class="tabs" role="tablist" aria-label={label}>
      {tabs.map(
        ({ id, label: text, icon, title, disabled, badge, badgeTone, alert }, i) => (
          <button
            key={id}
            type="button"
            role="tab"
            class="tab"
            aria-selected={value === id}
            tabIndex={value === id ? 0 : -1}
            title={title}
            disabled={disabled}
            onKeyDown={(e) => move(e, i)}
            onClick={() => onChange(id)}
          >
            {icon && <Icon name={icon} />}
            {text}
            {badge && (
              <span
                class={badgeTone === 'info' ? 'tab-badge tab-badge-info' : 'tab-badge'}
              >
                {badge}
              </span>
            )}
            {alert && <span class="tab-alert" aria-hidden="true" />}
          </button>
        ),
      )}
    </div>
  );
}
