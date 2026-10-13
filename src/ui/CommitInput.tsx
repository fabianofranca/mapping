import type { JSX } from 'preact';
import { useRef, useState } from 'preact/hooks';

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
 *
 * Teclado (`docs/ARCHITECTURE.md`, "Foco e teclado"): Enter confirma e o foco fica no campo
 * (etapa 8, F5); Esc com o que reverter volta ao valor atual e para aí (não fecha o diálogo
 * ou o menu em volta); sem o que reverter, sobe.
 */
export function CommitInput({ value, onCommit, ...rest }: CommitInputProps) {
  // O rascunho vale só enquanto o valor externo for o mesmo de quando foi digitado.
  const [draft, setDraft] = useState({ base: value, text: value });
  const text = draft.base === value ? draft.text : value;
  const setText = (next: string) => setDraft({ base: value, text: next });
  // A última gravação (sobre qual valor, com qual texto): o `change` que o navegador
  // dispara depois do Enter (ou ao sair) traz o mesmo texto e não grava de novo.
  const committed = useRef<{ readonly base: string; readonly text: string } | null>(null);

  // Lê o texto do próprio campo: o `change` pode chegar antes da renderização que
  // acompanha o `input`, e `text` ainda seria o valor antigo.
  const commit = (typed: string) => {
    if (typed === value) return;
    if (committed.current?.base === value && committed.current.text === typed) return;
    // Gravado: o rascunho passa a ser o texto gravado. Sem isto, voltar depois ao valor de
    // antes (desfazer, limpar por outro botão) reaproveitaria o rascunho antigo.
    if (onCommit(typed)) {
      committed.current = { base: value, text: typed };
      setDraft({ base: typed, text: typed });
    } else {
      setText(value);
    }
  };

  return (
    <input
      {...rest}
      value={text}
      onInput={(e) => setText(e.currentTarget.value)}
      onChange={(e) => commit(e.currentTarget.value)}
      onKeyDown={(e) => {
        // Também com Alt (nova linha): grava antes de a linha nova entrar.
        if (e.key === 'Enter') commit(e.currentTarget.value);
        if (e.key === 'Escape' && e.currentTarget.value !== value) {
          setText(value);
          e.preventDefault();
          e.stopPropagation();
        }
      }}
    />
  );
}
