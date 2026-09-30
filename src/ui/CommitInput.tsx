import type { JSX } from 'preact';
import { useState } from 'preact/hooks';

type InputProps = Omit<
  JSX.InputHTMLAttributes<HTMLInputElement>,
  'value' | 'onInput' | 'onChange' | 'onKeyDown'
>;

interface CommitInputProps extends InputProps {
  readonly value: string;
  /**
   * Chamado ao confirmar (Enter ou sair do campo) com um texto diferente do
   * atual. Devolve `false` para descartar o texto e voltar ao valor atual.
   */
  readonly onCommit: (text: string) => boolean;
}

/**
 * Campo de texto que só grava ao confirmar: digitar não gera uma entrada de
 * desfazer por tecla. Acompanha o valor externo (ex.: após desfazer).
 */
export function CommitInput({ value, onCommit, ...rest }: CommitInputProps) {
  // O rascunho vale só enquanto o valor externo for o mesmo de quando foi digitado.
  const [draft, setDraft] = useState({ base: value, text: value });
  const text = draft.base === value ? draft.text : value;
  const setText = (next: string) => setDraft({ base: value, text: next });

  const commit = () => {
    if (text !== value && !onCommit(text)) setText(value);
  };

  return (
    <input
      {...rest}
      value={text}
      onInput={(e) => setText(e.currentTarget.value)}
      onChange={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') e.currentTarget.blur();
        if (e.key === 'Escape') {
          setText(value);
          e.stopPropagation();
        }
      }}
    />
  );
}
