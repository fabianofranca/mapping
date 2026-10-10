import type { JSX } from 'preact';
import { Icon, type IconName } from '../icons';
import { classes } from './classes';
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
  /** `accept` e `reject`: o par ✓ ✕ do `DecisionControl` (revisão de propostas). */
  readonly variant?: 'default' | 'danger' | 'accept' | 'reject';
  /** `sm`: 24px no desktop (linhas e cartões da revisão); no celular continua com 44px. */
  readonly size?: 'md' | 'sm';
  /** Texto visível ao lado do ícone; sem ele, o botão mostra só o ícone. */
  readonly text?: string;
  /** Atalho mostrado na dica (e em `aria-keyshortcuts`). */
  readonly shortcut?: string;
  /** Botão de alternância (ex.: modo): `aria-pressed` e destaque visual. */
  readonly pressed?: boolean;
  /** Ponto de alerta no canto do ícone (ex.: erro novo no Diagnóstico). */
  readonly alert?: boolean;
  /** Selo numérico informativo no canto (ex.: propostas novas na faixa lateral). */
  readonly badge?: string;
}

function iconButtonClass(variant: string, size: 'md' | 'sm'): string {
  return classes(
    'icon-button',
    variant !== 'default' && `icon-button-${variant}`,
    size === 'sm' && 'icon-button-sm',
  );
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
  badge,
  size = 'md',
  type = 'button',
  ...rest
}: IconButtonProps) {
  return (
    <Tooltip label={tooltip ?? label} shortcut={shortcut}>
      <button
        {...rest}
        type={type}
        class={iconButtonClass(variant, size)}
        aria-pressed={pressed}
        aria-label={text ? undefined : label}
        aria-keyshortcuts={shortcut}
      >
        <Icon name={icon} />
        {alert && <span class="icon-button-alert" aria-hidden="true" />}
        {badge && (
          <span class="icon-button-badge" aria-hidden="true">
            {badge}
          </span>
        )}
        {text && <span class="icon-button-text">{text}</span>}
      </button>
    </Tooltip>
  );
}

interface IconLinkProps {
  readonly icon: IconName;
  /** Nome acessível (e texto da dica, se não houver `tooltip`). */
  readonly label: string;
  /** Texto da dica quando difere do nome. */
  readonly tooltip?: string;
  /** Endereço do link: sempre abre em outra aba e sem enviar o endereço da app (`noreferrer`). */
  readonly href: string;
  readonly variant?: 'default' | 'danger';
}

/**
 * Link com a aparência do botão de ícone (mesmo tamanho, hover e foco): um `<a>` comum,
 * sem nenhuma requisição feita pela app (quem navega é o navegador, ao clicar).
 */
export function IconLink({
  icon,
  label,
  tooltip,
  href,
  variant = 'default',
}: IconLinkProps) {
  return (
    <Tooltip label={tooltip ?? label}>
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        class={variant === 'danger' ? 'icon-button icon-button-danger' : 'icon-button'}
        aria-label={label}
      >
        <Icon name={icon} />
      </a>
    </Tooltip>
  );
}
