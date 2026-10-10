import type { JSX } from 'preact';
import { classes } from './classes';

/**
 * `accept` e `reject`: os botões de decisão da revisão ("Aceitar item" / "Rejeitar item",
 * HANDOFF-PROPOSALS 2.2), alternâncias com `aria-pressed` que se enchem de `color-success`
 * ou `color-danger` quando marcadas.
 */
export type ButtonVariant =
  'default' | 'primary' | 'danger' | 'accept' | 'reject' | 'ghost';

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
