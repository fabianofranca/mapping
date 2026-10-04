import type { JSX } from 'preact';
import { classes } from './classes';

export type ButtonVariant = 'default' | 'primary' | 'danger';

type NativeButton = Omit<JSX.ButtonHTMLAttributes<HTMLButtonElement>, 'class' | 'size'>;

interface ButtonProps extends NativeButton {
  readonly variant?: ButtonVariant;
  /** `sm` é o controle compacto do desktop (24px); no celular todo botão tem 44px. */
  readonly size?: 'md' | 'sm';
  /** Classes extras de layout (a aparência do botão vem de `variant` e `size`). */
  readonly class?: string;
}

/** Botão com texto. Estados (hover, pressionado, foco, desabilitado) vêm do CSS. */
export function Button({
  variant = 'default',
  size = 'md',
  type = 'button',
  class: extra,
  ...rest
}: ButtonProps) {
  return (
    <button
      {...rest}
      type={type}
      class={classes(
        'button',
        variant !== 'default' && `button-${variant}`,
        size === 'sm' && 'button-sm',
        extra,
      )}
    />
  );
}
