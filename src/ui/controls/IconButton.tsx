import type { JSX } from 'preact';
import { Icon, type IconName } from '../icons';
import { Tooltip } from './Tooltip';

type NativeButton = Omit<
  JSX.ButtonHTMLAttributes<HTMLButtonElement>,
  'class' | 'size' | 'title' | 'icon'
>;

interface IconButtonProps extends NativeButton {
  readonly icon: IconName;
  /** Nome acessível (e texto da dica, se não houver `tooltip`). */
  readonly label: string;
  /** Texto da dica quando difere do nome (ex.: o motivo de o botão estar desabilitado). */
  readonly tooltip?: string;
  readonly variant?: 'default' | 'danger';
  /** Texto visível ao lado do ícone; sem ele, o botão mostra só o ícone. */
  readonly text?: string;
  /** Atalho mostrado na dica (e em `aria-keyshortcuts`). */
  readonly shortcut?: string;
  /** Botão de alternância (ex.: modo): `aria-pressed` e destaque visual. */
  readonly pressed?: boolean;
  /** Ponto de alerta no canto do ícone (ex.: erro novo no Diagnóstico). */
  readonly alert?: boolean;
}

/** Botão de ícone (28px no desktop, 44px no celular), com dica. */
export function IconButton({
  icon,
  label,
  tooltip,
  variant = 'default',
  text,
  shortcut,
  pressed,
  alert,
  type = 'button',
  ...rest
}: IconButtonProps) {
  return (
    <Tooltip label={tooltip ?? label} shortcut={shortcut}>
      <button
        {...rest}
        type={type}
        class={variant === 'danger' ? 'icon-button icon-button-danger' : 'icon-button'}
        aria-pressed={pressed}
        aria-label={text ? undefined : label}
        aria-keyshortcuts={shortcut}
      >
        <Icon name={icon} />
        {alert && <span class="icon-button-alert" aria-hidden="true" />}
        {text && <span class="icon-button-text">{text}</span>}
      </button>
    </Tooltip>
  );
}
