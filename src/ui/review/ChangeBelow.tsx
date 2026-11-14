import { t } from '../../i18n';
import { reviewKey } from '../../model';
import { useEditor } from '../EditorContext';
import { Icon } from '../icons';
import { Flag } from './Flag';

// The row below the control of a changed field (HANDOFF-REVIEW-DETAILS 5.5 and 5.7): the
// change note (icon and text) and, in a replaced proposal, the same / different /
// not in the new one badge. With neither of the two, it draws nothing.

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
