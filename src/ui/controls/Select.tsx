import type { ComponentChildren, JSX } from 'preact';
import { Icon } from '../icons';
import { classes } from './classes';

type NativeSelect = Omit<JSX.SelectHTMLAttributes<HTMLSelectElement>, 'class' | 'size'>;

interface SelectProps extends NativeSelect {
  /** Visible label (the field sits inside the `<label>`); without it, pass `aria-label`. */
  readonly label?: ComponentChildren;
  readonly invalid?: boolean;
  readonly size?: 'md' | 'sm';
}

/** Selection of one option (`<option>` as children), with the arrow of the new design. */
export function Select({ label, invalid, size = 'md', children, ...rest }: SelectProps) {
  const control = (
    <span class="select">
      <select
        {...rest}
        class={classes(
          'input',
          'select-control',
          size === 'sm' && 'input-sm',
          invalid && 'input-invalid',
        )}
        aria-invalid={invalid}
      >
        {children}
      </select>
      <span class="select-chevron" aria-hidden="true">
        <Icon name="chevronDown" />
      </span>
    </span>
  );
  return label === undefined ? (
    control
  ) : (
    <label class="field">
      {label}
      {control}
    </label>
  );
}
