import type { JSX } from 'preact';
import { useEffect, useLayoutEffect, useRef } from 'preact/hooks';
import { Icon, type IconName } from '../icons';

export interface TabItem<T extends string> {
  readonly id: T;
  readonly label: string;
  /** Icon before the label. */
  readonly icon?: IconName;
  /** Accessible name when the label is empty (icon-only tab with counter). */
  readonly ariaLabel?: string;
  /** Native hint (`title`). */
  readonly title?: string;
  readonly disabled?: boolean;
  /** Counter beside the label (e.g. how many pending items). */
  readonly badge?: string;
  /** `info`: counter that announces something new (e.g. new proposals), highlighted. */
  readonly badgeTone?: 'muted' | 'info';
  /** Alert dot beside the label (e.g. new error). */
  readonly alert?: boolean;
  /**
   * Needs `icon`. The label sits in `.tab-label` and the icon in `.tab-icon`; CSS decides
   * which one shows (e.g. icon only inside a narrow container).
   */
  readonly compact?: boolean;
}

/**
 * Accessible name: set when the tab has a counter or is compact or icon-only (its text alone
 * would not say it all); the counter follows the name after a space. Otherwise the content names it.
 */
function accessibleName<T extends string>(
  tab: Pick<TabItem<T>, 'label' | 'ariaLabel' | 'badge' | 'compact' | 'icon'>,
): string | undefined {
  const { label, ariaLabel, badge, compact, icon } = tab;
  const iconOnly = Boolean(icon) && !label;
  if (!badge && !compact && !iconOnly) return ariaLabel;
  const name = ariaLabel ?? label;
  return badge ? `${name} ${badge}` : name;
}

interface TabsProps<T extends string> {
  readonly tabs: readonly TabItem<T>[];
  readonly value: T;
  readonly onChange: (id: T) => void;
  /** Accessible name of the tab list. */
  readonly label: string;
}

/**
 * Underlined tabs (2px). Arrows, Home and End move among
 * the tabs (focus and selection go together); only the chosen tab enters the Tab order.
 */
export function Tabs<T extends string>({
  tabs,
  value,
  onChange,
  label,
}: TabsProps<T>): JSX.Element {
  const listRef = useRef<HTMLDivElement>(null);
  // Scrolling list (narrow window): the chosen tab never stays outside the visible strip,
  // on switching tabs and also when the list itself is resized.
  const reveal = (): void => {
    const list = listRef.current;
    const tab = list?.querySelector<HTMLElement>('[role="tab"][aria-selected="true"]');
    if (!list || !tab) return;
    const left = tab.offsetLeft - list.offsetLeft;
    const right = left + tab.offsetWidth;
    if (left < list.scrollLeft) list.scrollLeft = left;
    else if (right > list.scrollLeft + list.clientWidth)
      list.scrollLeft = right - list.clientWidth;
  };
  const revealRef = useRef(reveal);
  revealRef.current = reveal;
  useLayoutEffect(reveal, [value, tabs.length]);
  useEffect(() => {
    const list = listRef.current;
    if (!list || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(() => revealRef.current());
    observer.observe(list);
    return () => observer.disconnect();
  }, []);

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
        (
          {
            id,
            label: text,
            icon,
            title,
            ariaLabel,
            disabled,
            badge,
            badgeTone,
            alert,
            compact,
          },
          i,
        ) => (
          <button
            key={id}
            type="button"
            role="tab"
            class="tab"
            aria-selected={value === id}
            tabIndex={value === id ? 0 : -1}
            title={title}
            aria-label={accessibleName({ label: text, ariaLabel, badge, compact, icon })}
            disabled={disabled}
            onKeyDown={(e) => move(e, i)}
            onClick={() => onChange(id)}
          >
            {icon &&
              (compact && text ? (
                <span class="tab-icon">
                  <Icon name={icon} />
                </span>
              ) : (
                <Icon name={icon} />
              ))}
            {text && <span class="tab-label">{text}</span>}
            {badge && (
              <span
                aria-hidden="true"
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
