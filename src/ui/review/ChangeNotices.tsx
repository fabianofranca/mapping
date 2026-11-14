import { changeNotices, compareNotices, type Change } from '../../model';
import { useEditor } from '../EditorContext';
import { NoticeLine } from '../NoticeBadge';

// Specialization notices in the review (stage #486, decision 10): right below the change that
// creates an annotation of a type with a notice, changes the type or writes a value into a field or column with a notice,
// in the `kind` style. They only inform: Accept and Apply do not depend on them.

export function ChangeNotices({
  change,
  field,
}: {
  readonly change: Change;
  /** Field shown in the marker (`''`: the whole annotation). */
  readonly field: string;
}) {
  const { review } = useEditor();
  // The preview with all the unapplied changes: the notice also appears on the rejected one.
  const preview = review.derived.fullPreview.value;
  if (!preview) return null;
  const usages = [...changeNotices(preview, change, field)].sort((a, b) =>
    compareNotices(a.notice, b.notice),
  );
  if (usages.length === 0) return null;
  return (
    <div class="change-notices">
      {usages.map((usage, index) => (
        <NoticeLine
          key={`${usage.notice.kind}-${index}`}
          notice={usage.notice}
          column={usage.scope === 'column' ? usage.column : undefined}
        />
      ))}
    </div>
  );
}
