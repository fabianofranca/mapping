import type { ComponentChildren, JSX, Ref } from 'preact';
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
  /** `sm` é o controle compacto (24px). */
  readonly size?: 'md' | 'sm';
  /** Classes extras de layout (a aparência do botão vem de `variant` e `size`). */
  readonly class?: string;
  /** O `<button>` (para devolver o foco a ele), como o `inputRef` do `TextField`. */
  readonly buttonRef?: Ref<HTMLButtonElement>;
}

/** Botão com texto. Estados (hover, pressionado, foco, desabilitado) vêm do CSS. */
export function Button({
  variant = 'default',
  size = 'md',
  type = 'button',
  class: extra,
  buttonRef,
  ...rest
}: ButtonProps) {
  return (
    <button
      {...rest}
      ref={buttonRef}
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

interface LinkButtonProps {
  /** Endereço do link: sempre abre em outra aba, sem enviar o endereço da app. */
  readonly href: string;
  readonly children: ComponentChildren;
  readonly class?: string;
}

/**
 * Link com a aparência do `Button`: um `<a>` comum que abre em outra aba (`noopener`), sem
 * nenhuma requisição feita pela app (quem navega é o navegador, ao clicar).
 */
export function LinkButton({ href, children, class: extra }: LinkButtonProps) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      class={classes('button', extra)}
    >
      {children}
    </a>
  );
}
