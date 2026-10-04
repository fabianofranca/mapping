import type { ComponentChildren, JSX } from 'preact';

type NativeInput = Omit<
  JSX.InputHTMLAttributes<HTMLInputElement>,
  'class' | 'size' | 'type'
>;

interface ChoiceProps extends NativeInput {
  readonly type?: 'checkbox' | 'radio';
  readonly label: ComponentChildren;
  /** Texto de apoio, em cinza, logo depois do rótulo. */
  readonly hint?: string;
}

/** Caixa de seleção ou rádio com o rótulo na mesma linha (e clicável). */
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
