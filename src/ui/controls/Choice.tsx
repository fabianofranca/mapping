import type { ComponentChildren, JSX } from 'preact';

type NativeInput = Omit<
  JSX.InputHTMLAttributes<HTMLInputElement>,
  'class' | 'size' | 'type'
>;

interface ChoiceProps extends NativeInput {
  readonly type?: 'checkbox' | 'radio';
  readonly label: ComponentChildren;
  /** Supporting text, in gray, right after the label. */
  readonly hint?: string;
}

/** Checkbox or radio with the label on the same line (and clickable). */
export function Choice({ type = 'checkbox', label, hint, ...rest }: ChoiceProps) {
  return (
    <label class="choice">
      <input {...rest} type={type} class="choice-input" />
      <span class="choice-label">
        <span>
          {label}
          {hint && <small class="muted choice-hint">{hint}</small>}
        </span>
      </span>
    </label>
  );
}
