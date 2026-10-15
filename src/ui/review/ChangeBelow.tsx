import { t } from '../../i18n';
import { reviewKey } from '../../model';
import { useEditor } from '../EditorContext';
import { Icon } from '../icons';
import { Flag } from './Flag';

// A linha embaixo do controle de um campo alterado (HANDOFF-REVIEW-DETAILS 5.5 e 5.7): a
// nota da mudança (ícone e texto) e, numa proposta substituída, o selo igual / diferente /
// não consta na nova. Sem nenhum dos dois, não desenha nada.

export function ChangeBelow({ changeId }: { readonly changeId: string }) {
  const { review } = useEditor();
  const d = review.derived;
  const notes = d.notes.value.get(reviewKey({ level: 'change', id: changeId }));
  const comparison = d.supersession.value?.comparison?.get(changeId) ?? null;
  if ((!notes || notes.length === 0) && !comparison) return null;
  return (
    <div class="change-below">
      {comparison && (
        <Flag tone={comparison === 'missing' ? 'danger' : 'neutral'}>
          {t(`review.compare.${comparison}`)}
        </Flag>
      )}
      {notes?.map((note) => (
        <p key={note.id} class="change-note-line">
          <Icon name="note" />
          <span>{note.text}</span>
        </p>
      ))}
    </div>
  );
}
