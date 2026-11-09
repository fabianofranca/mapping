import { t } from '../../i18n';
import { useEditor } from '../EditorContext';
import { describeCitation, useCitationContext } from './citationContext';
import { goToCitation } from './citationNav';

interface CitationChipProps {
  /** O destino `mapping://…` da citação, como está no texto. */
  readonly url: string;
  /** O rótulo entre colchetes: a reserva de quando o alvo não existe mais. */
  readonly label: string;
}

/**
 * O chip vivo de uma citação numa mensagem (decisões 28 e 29): mostra o nome de agora do alvo
 * e leva até ele ao clicar. Alvo apagado: chip riscado com o rótulo de reserva e a dica.
 */
export function CitationChip({ url, label }: CitationChipProps) {
  const editor = useEditor();
  const view = describeCitation(useCitationContext(), url, label);
  const { target } = view;
  return (
    <button
      type="button"
      class={view.broken ? 'citation-chip citation-chip-broken' : 'citation-chip'}
      title={view.broken ? t('citation.missing') : undefined}
      aria-label={t('citation.chipLabel', { name: view.name })}
      onClick={() => {
        if (target !== null) goToCitation(editor, target);
      }}
    >
      {view.name}
    </button>
  );
}
