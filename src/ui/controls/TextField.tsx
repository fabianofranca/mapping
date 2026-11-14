import type { ComponentChildren, JSX, Ref } from 'preact';
import { CommitInput } from '../CommitInput';
import type { SuggestionInput, SuggestionItem } from '../suggestions';
import { classes } from './classes';

type NativeInput = Omit<
  JSX.InputHTMLAttributes<HTMLInputElement>,
  'class' | 'size' | 'value'
>;

interface CommonProps {
  /** Visible label (the field sits inside the `<label>`); without it, pass `aria-label`. */
  readonly label?: ComponentChildren;
  readonly value: string;
  /** Invalid state: error border and background, and `aria-invalid`. */
  readonly invalid?: boolean;
  /** Compact desktop control (24px). */
  readonly size?: 'md' | 'sm';
}

/** Plain `<input>`: the value changes on every keystroke (`onInput`). */
type PlainProps = CommonProps &
  NativeInput & {
    readonly onCommit?: undefined;
    /** Reference to the `<input>` (e.g. to focus on mount). */
    readonly inputRef?: Ref<HTMLInputElement>;
  };

/** Only saves on confirm (Enter or leaving the field), like `CommitInput`. */
type CommitProps = CommonProps &
  Omit<NativeInput, 'onInput' | 'onChange' | 'onKeyDown'> & {
    /** The second argument is the chosen `linkedRef` item that is still present in the text. */
    readonly onCommit: (text: string, chosen?: SuggestionItem) => boolean;
    /**
     * Suggestions while typing (only in this mode): floating combobox list that completes the
     * word under the cursor; does not restrict the value. Plain text or `{ label, detail? }`.
     */
    readonly suggestions?: readonly SuggestionInput[];
  };

type TextFieldProps = PlainProps | CommitProps;

/**
 * Text, number or date field, with all states (hover, focus, invalid, read-only
 * and disabled).
 */
export function TextField(props: TextFieldProps) {
  const { label, invalid, size = 'md', ...rest } = props;
  const className = classes(
    'input',
    size === 'sm' && 'input-sm',
    invalid === true && 'input-invalid',
  );
  let control;
  if (rest.onCommit === undefined) {
    const { inputRef, ...input } = rest;
    control = (
      <input {...input} ref={inputRef} class={className} aria-invalid={invalid} />
    );
  } else {
    control = <CommitInput {...rest} class={className} aria-invalid={invalid} />;
  }
  return label === undefined ? (
    control
  ) : (
    <label class="field">
      {label}
      {control}
    </label>
  );
}

type NativeTextArea = Omit<
  JSX.TextareaHTMLAttributes<HTMLTextAreaElement>,
  'class' | 'value' | 'onInput' | 'onChange' | 'onBlur'
>;

interface TextAreaProps extends NativeTextArea {
  /** Visible label; without it, pass `aria-label`. */
  readonly label?: ComponentChildren;
  readonly value: string;
  readonly invalid?: boolean;
  readonly onInput?: (text: string) => void;
  /** On leaving the field (saves the note, for example). */
  readonly onCommit?: (text: string) => void;
  readonly textAreaRef?: Ref<HTMLTextAreaElement>;
}

/**
 * Multi-line text field (`mp-field--area` variant of TextField, proposal review): same border,
 * focus and states as the single-line field, free height.
 */
export function TextArea({
  label,
  value,
  invalid,
  onInput,
  onCommit,
  textAreaRef,
  rows = 3,
  ...rest
}: TextAreaProps) {
  const control = (
    <textarea
      {...rest}
      ref={textAreaRef}
      rows={rows}
      value={value}
      class={classes('input', 'input-area', invalid === true && 'input-invalid')}
      aria-invalid={invalid}
      onInput={(e) => onInput?.(e.currentTarget.value)}
      onBlur={(e) => onCommit?.(e.currentTarget.value)}
    />
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
