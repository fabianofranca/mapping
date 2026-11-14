import type { JSX, Ref } from 'preact';
import { ariaKeys } from '../../app/shortcuts';
import { Icon, type IconName } from '../icons';
import { classes } from './classes';
import { Tooltip, type TooltipPlacement } from './Tooltip';

type NativeButton = Omit<
  JSX.ButtonHTMLAttributes<HTMLButtonElement>,
  'class' | 'size' | 'title' | 'icon'
>;

interface IconButtonProps extends NativeButton {
  readonly icon: IconName;
  /** Accessible name (and tip text, if there is no `tooltip`). */
  readonly label: string;
  /** Tip text when it differs from the name (e.g. why the button is disabled). */
  readonly tooltip?: string;
  /** `accept` and `reject`: the ✓ ✕ pair of `DecisionControl` (proposal review). */
  readonly variant?: 'default' | 'danger' | 'accept' | 'reject';
  /** `sm`: 24px (review rows and cards). */
  readonly size?: 'md' | 'sm';
  /** Visible text beside the icon; without it, the button shows only the icon. */
  readonly text?: string;
  /** Atalho mostrado na dica (e, na sintaxe ARIA, em `aria-keyshortcuts`). */
  readonly shortcut?: string;
  /** Toggle button (e.g. mode): `aria-pressed` and visual highlight. */
  readonly pressed?: boolean;
  /** Alert dot at the icon corner (e.g. new error in Diagnostics). */
  readonly alert?: boolean;
  /** Informative numeric badge at the corner (e.g. new proposals on the side strip). */
  readonly badge?: string;
  /** Hides the tip (the panel the button opened is already open). */
  readonly tooltipSuppressed?: boolean;
  /** Where the tip opens (`end`: beside it, on the side strip); default: below. */
  readonly tooltipPlacement?: TooltipPlacement;
  /** O `<button>` (para devolver o foco a ele), como o `inputRef` do `TextField`. */
  readonly buttonRef?: Ref<HTMLButtonElement>;
}

function iconButtonClass(variant: string, size: 'md' | 'sm'): string {
  return classes(
    'icon-button',
    variant !== 'default' && `icon-button-${variant}`,
    size === 'sm' && 'icon-button-sm',
  );
}

/** Icon button (28px), with a tip. */
export function IconButton({
  icon,
  label,
  tooltip,
  tooltipPlacement,
  tooltipSuppressed,
  variant = 'default',
  text,
  shortcut,
  pressed,
  alert,
  badge,
  size = 'md',
  type = 'button',
  buttonRef,
  ...rest
}: IconButtonProps) {
  return (
    <Tooltip
      label={tooltip ?? label}
      shortcut={shortcut}
      placement={tooltipPlacement}
      suppressed={tooltipSuppressed}
    >
      <button
        {...rest}
        ref={buttonRef}
        type={type}
        class={iconButtonClass(variant, size)}
        aria-pressed={pressed}
        aria-label={text ? undefined : label}
        aria-keyshortcuts={ariaKeys(shortcut)}
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
  /** Accessible name (and tip text, if there is no `tooltip`). */
  readonly label: string;
  /** Texto da dica quando difere do nome. */
  readonly tooltip?: string;
  /** Link address: always opens in another tab and without sending the app's address (`noreferrer`). */
  readonly href: string;
  readonly variant?: 'default' | 'danger';
}

/**
 * Link with the icon button's look (same size, hover and focus): a plain `<a>`,
 * with no request made by the app (the browser navigates, on click).
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
