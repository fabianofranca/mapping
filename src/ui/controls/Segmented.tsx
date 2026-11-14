import type { JSX } from 'preact';
import { ariaKeys } from '../../app/shortcuts';
import { Icon, type IconName } from '../icons';
import { classes } from './classes';
import { Tooltip } from './Tooltip';

export interface SegmentedItem<T extends string> {
  readonly id: T;
  /** Accessible name (and tooltip text on icon-only items). */
  readonly label: string;
  readonly icon?: IconName;
  /** Shows the label as text (without `icon`, the label always appears). */
  readonly showLabel?: boolean;
  readonly shortcut?: string;
  readonly disabled?: boolean;
}

interface SegmentedProps<T extends string> {
  readonly items: readonly SegmentedItem<T>[];
  /** Chosen item (`null`: none). */
  readonly value: T | null;
  /** Called when any item is triggered, including the already chosen one (the caller decides). */
  readonly onSelect: (id: T) => void;
  /** Accessible name of the group. */
  readonly label?: string;
  readonly disabled?: boolean;
  /** Invalid state (e.g. required option with no choice): error border. */
  readonly invalid?: boolean;
}

/** Group of joined toggle buttons (mode, enum options). */
export function Segmented<T extends string>({
  items,
  value,
  onSelect,
  label,
  disabled,
  invalid,
}: SegmentedProps<T>): JSX.Element {
  return (
    <div
      class={classes('segmented', invalid && 'segmented-invalid')}
      role="group"
      aria-label={label}
      aria-invalid={invalid}
    >
      {items.map((item) => {
        const text = item.icon === undefined || item.showLabel === true;
        const button = (
          <button
            type="button"
            class={classes('segmented-item', !text && 'segmented-item-icon')}
            aria-pressed={value === item.id}
            aria-label={text ? undefined : item.label}
            aria-keyshortcuts={ariaKeys(item.shortcut)}
            disabled={disabled === true || item.disabled === true}
            onClick={() => onSelect(item.id)}
          >
            {item.icon && <Icon name={item.icon} />}
            {text && <span class="segmented-text">{item.label}</span>}
          </button>
        );
        return text ? (
          <span key={item.id} class="segmented-cell">
            {button}
          </span>
        ) : (
          <Tooltip key={item.id} label={item.label} shortcut={item.shortcut}>
            {button}
          </Tooltip>
        );
      })}
    </div>
  );
}
