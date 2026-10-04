import type { JSX } from 'preact';

export interface TabItem<T extends string> {
  readonly id: T;
  readonly label: string;
  /** Dica nativa (`title`). */
  readonly title?: string;
  readonly disabled?: boolean;
}

interface TabsProps<T extends string> {
  readonly tabs: readonly TabItem<T>[];
  readonly value: T;
  readonly onChange: (id: T) => void;
  /** Nome acessível da lista de abas. */
  readonly label: string;
}

/**
 * Abas com sublinhado (2px no desktop, 3px no celular). Setas, Home e End movem entre
 * as abas (o foco e a seleção andam juntos); só a aba escolhida entra na ordem do Tab.
 */
export function Tabs<T extends string>({
  tabs,
  value,
  onChange,
  label,
}: TabsProps<T>): JSX.Element {
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
    <div class="tabs" role="tablist" aria-label={label}>
      {tabs.map(({ id, label: text, title, disabled }, i) => (
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
          {text}
        </button>
      ))}
    </div>
  );
}
