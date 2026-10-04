import type { JSX } from 'preact';
import { Icon, type IconName } from '../icons';
import { classes } from './classes';
import { Tooltip } from './Tooltip';

export interface SegmentedItem<T extends string> {
  readonly id: T;
  /** Nome acessível (e texto da dica nos itens só com ícone). */
  readonly label: string;
  readonly icon?: IconName;
  /** Mostra o rótulo como texto (sem `icon`, o rótulo sempre aparece). */
  readonly showLabel?: boolean;
  readonly shortcut?: string;
  readonly disabled?: boolean;
}

interface SegmentedProps<T extends string> {
  readonly items: readonly SegmentedItem<T>[];
  /** Item escolhido (`null`: nenhum). */
  readonly value: T | null;
  /** Chamado ao acionar qualquer item, inclusive o já escolhido (quem usa decide). */
  readonly onSelect: (id: T) => void;
  /** Nome acessível do grupo. */
  readonly label?: string;
  readonly disabled?: boolean;
  /** Estado inválido (ex.: opção obrigatória sem escolha): borda de erro. */
  readonly invalid?: boolean;
}

/** Grupo de botões de alternância unidos (modo, opções de enum). */
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
            aria-keyshortcuts={item.shortcut}
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
