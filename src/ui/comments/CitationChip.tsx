import { t } from '../../i18n';
import { useEditor } from '../EditorContext';
import { describeCitation, useCitationContext } from './citationContext';
import { goToCitation } from './citationNav';

interface CitationChipProps {
  /** The citation's `mapping://…` target, as it is in the text. */
  readonly url: string;
  /** The label in brackets: the fallback for when the target no longer exists. */
  readonly label: string;
}

/**
 * The live chip of a citation in a message (decisions 28 and 29): shows the target's current name
 * and goes to it on click. Deleted target: struck-through chip with the fallback label and the tip.
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
