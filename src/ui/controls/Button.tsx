import type { ComponentChildren, JSX, Ref } from 'preact';
import { classes } from './classes';

/**
 * `accept` and `reject`: the review decision buttons ("Accept item" / "Reject item",
 * HANDOFF-PROPOSALS 2.2), toggles with `aria-pressed` that fill with `color-success`
 * or `color-danger` when marked.
 */
export type ButtonVariant =
  'default' | 'primary' | 'danger' | 'accept' | 'reject' | 'ghost';

type NativeButton = Omit<JSX.ButtonHTMLAttributes<HTMLButtonElement>, 'class' | 'size'>;

interface ButtonProps extends NativeButton {
  readonly variant?: ButtonVariant;
  /** `sm` is the compact control (24px). */
  readonly size?: 'md' | 'sm';
  /** Extra layout classes (the button's look comes from `variant` and `size`). */
  readonly class?: string;
  /** The `<button>` (to give focus back to it), like the `inputRef` of `TextField`. */
  readonly buttonRef?: Ref<HTMLButtonElement>;
}

/** Button with text. States (hover, pressed, focus, disabled) come from the CSS. */
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
  /** Link address: always opens in another tab, without sending the app's address. */
  readonly href: string;
  readonly children: ComponentChildren;
  readonly class?: string;
}

/**
 * Link with the look of `Button`: a plain `<a>` that opens in another tab (`noopener`), with
 * no request made by the app (the browser navigates, on click).
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
