import { t } from '../../i18n';
import { isRecord, revisionMark, type Change, type JsonValue } from '../../model';
import { useEditor } from '../EditorContext';
import { entityFieldLabel, valueParts, type ReviewNames } from './changeText';
import { DiffValue, type DiffRow } from './DiffValue';
import { useReviewNames } from './useReview';

// Bloco "Antes da revisão" do popover da mudança que o agente trocou (etapa #644, CP3,
// decisão 5): o que ele tinha proposto, só o que difere numa criação, e a decisão de antes.
// Só para uma mudança com marca à vista (sem decisão); a nova na revisão não tem "antes".

const same = (a: JsonValue | undefined, b: JsonValue | undefined) =>
  JSON.stringify(a) === JSON.stringify(b);

/** Linhas de uma criação: só os campos do `to` de antes que diferem do `to` atual. */
function creationRows(names: ReviewNames, c: Change, before: JsonValue): DiffRow[] {
  if (!isRecord(before) || !isRecord(c.to)) return [];
  const now = c.to;
  return Object.keys(before)
    .filter((key) => !same(before[key], now[key]))
    .map((key) => ({
      kind: 'before' as const,
      label: entityFieldLabel(c.entity, key),
      parts: valueParts(
        names,
        { ...c, kind: 'update', field: key },
        before[key],
        now[key],
      ),
    }));
}

/** As linhas do que o agente tinha proposto antes da revisão. */
export function beforeRows(names: ReviewNames, c: Change, before: JsonValue): DiffRow[] {
  const fields = c.kind === 'create' ? creationRows(names, c, before) : [];
  if (fields.length > 0) return fields;
  return [
    {
      kind: 'before',
      label: t('review.revised.beforeTo'),
      parts: valueParts(names, c, before, c.to),
    },
  ];
}

export function RevisedBefore({ change }: { readonly change: Change }) {
  const { review } = useEditor();
  const names = useReviewNames();
  if (!names || !review.derived.revisedIds.value.has(change.id)) return null;
  const previous = revisionMark(names.proposal, change.id)?.previous;
  if (!previous) return null;
  const rows = beforeRows(names, change, previous.to);
  const perField = rows.length > 0 && rows[0]?.label !== t('review.revised.beforeTo');
  return (
    <section class="revised-before" aria-label={t('review.revised.before')}>
      <strong class="revised-before-title">{t('review.revised.before')}</strong>
      {perField && <p class="muted">{t('review.revised.beforeTo')}</p>}
      <DiffValue rows={rows} />
      <p class="muted">
        {t(
          previous.state === 'rejected'
            ? 'review.revised.beforeState.rejected'
            : 'review.revised.beforeState.none',
        )}
      </p>
    </section>
  );
}
