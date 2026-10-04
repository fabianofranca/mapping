import type { ComponentChildren, JSX, Ref } from 'preact';
import { CommitInput } from '../CommitInput';
import { classes } from './classes';

type NativeInput = Omit<
  JSX.InputHTMLAttributes<HTMLInputElement>,
  'class' | 'size' | 'value'
>;

interface CommonProps {
  /** Rótulo visível (o campo fica dentro do `<label>`); sem ele, passe `aria-label`. */
  readonly label?: ComponentChildren;
  readonly value: string;
  /** Estado inválido: borda e fundo de erro, e `aria-invalid`. */
  readonly invalid?: boolean;
  /** Controle compacto do desktop (24px). */
  readonly size?: 'md' | 'sm';
}

/** `<input>` comum: o valor muda a cada tecla (`onInput`). */
type PlainProps = CommonProps &
  NativeInput & {
    readonly onCommit?: undefined;
    /** Referência ao `<input>` (ex.: para focar ao montar). */
    readonly inputRef?: Ref<HTMLInputElement>;
  };

/** Só grava ao confirmar (Enter ou sair do campo), como o `CommitInput`. */
type CommitProps = CommonProps &
  Omit<NativeInput, 'onInput' | 'onChange' | 'onKeyDown'> & {
    readonly onCommit: (text: string) => boolean;
  };

type TextFieldProps = PlainProps | CommitProps;

/**
 * Campo de texto, número ou data, com todos os estados (hover, foco, inválido, somente
 * leitura e desabilitado).
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
