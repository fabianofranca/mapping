import { t } from '../../i18n';
import {
  VALUES_FIELD_PREFIX,
  isRecord,
  revisionMark,
  type Change,
  type JsonValue,
} from '../../model';
import { useEditor } from '../EditorContext';
import {
  entityFieldLabel,
  valueFieldLabel,
  valueParts,
  type ReviewNames,
} from './changeText';
import { DiffValue, type DiffRow } from './DiffValue';
import { useReviewNames } from './useReview';

// "Before the review" block of the popover of the change the agent swapped (stage #644, CP3,
// decision 5): what it had proposed, only what differs in a creation, and the earlier decision.
// Only for a change with a visible mark (no decision); the new one in review has no "before".

const same = (a: JsonValue | undefined, b: JsonValue | undefined) =>
  JSON.stringify(a) === JSON.stringify(b);

const asRecord = (v: JsonValue | undefined): Record<string, JsonValue> =>
  isRecord(v) ? v : {};

/** Rows of `values`: one per field of the typed annotation that changed, with the specialization's label. */
function valuesRows(
  names: ReviewNames,
  c: Change,
  before: JsonValue | undefined,
  now: JsonValue | undefined,
): DiffRow[] {
  const was = asRecord(before);
  const is = asRecord(now);
  const keys = [...new Set([...Object.keys(was), ...Object.keys(is)])];
  return keys
    .filter((key) => !same(was[key], is[key]))
    .map((key) => ({
      kind: 'before' as const,
      label: valueFieldLabel(names, c, key),
      parts: valueParts(
        names,
        { ...c, kind: 'update', field: `${VALUES_FIELD_PREFIX}${key}` },
        was[key],
        is[key],
      ),
    }));
}

/** Value of an `entries` pair by key (the key identifies the pair). */
function entryMap(value: JsonValue | undefined): Map<string, JsonValue | undefined> {
  const map = new Map<string, JsonValue | undefined>();
  if (!Array.isArray(value)) return map;
  for (const entry of value) {
    if (isRecord(entry) && typeof entry.key === 'string') map.set(entry.key, entry.value);
  }
  return map;
}

const entryText = (v: JsonValue | undefined): string =>
  typeof v === 'string' && v !== '' ? v : t('review.value.empty');

/** Rows of `entries`: one per pair (by key) that changed, was added or was removed. */
function entriesRows(
  before: JsonValue | undefined,
  now: JsonValue | undefined,
): DiffRow[] {
  const was = entryMap(before);
  const is = entryMap(now);
  return [...new Set([...was.keys(), ...is.keys()])]
    .filter((key) => !(was.has(key) && is.has(key) && same(was.get(key), is.get(key))))
    .map((key) => ({
      kind: 'before' as const,
      label: key,
      parts: [
        { text: was.has(key) ? entryText(was.get(key)) : t('review.pop.notThere') },
      ],
    }));
}

/** Rows of a creation: only what changed, descending into `values` and `entries`. */
function creationRows(names: ReviewNames, c: Change, before: JsonValue): DiffRow[] {
  if (!isRecord(before) || !isRecord(c.to)) return [];
  const now = c.to;
  const fields = Object.keys(before)
    .filter((key) => key !== 'values' && key !== 'entries')
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
  return [
    ...fields,
    ...valuesRows(names, c, before.values, now.values),
    ...entriesRows(before.entries, now.entries),
  ];
}

/** The rows of what the agent had proposed before the review. */
export function beforeRows(
  names: ReviewNames,
  c: Change,
  before: JsonValue,
): { readonly rows: DiffRow[]; readonly perField: boolean } {
  const fields = c.kind === 'create' ? creationRows(names, c, before) : [];
  if (fields.length > 0) return { rows: fields, perField: true };
  return {
    rows: [
      {
        kind: 'before',
        label: t('review.revised.beforeTo'),
        parts: valueParts(names, c, before, c.to),
      },
    ],
    perField: false,
  };
}

export function RevisedBefore({ change }: { readonly change: Change }) {
  const { review } = useEditor();
  const names = useReviewNames();
  if (!names || !review.derived.revisedIds.value.has(change.id)) return null;
  const previous = revisionMark(names.proposal, change.id)?.previous;
  if (!previous) return null;
  const { rows, perField } = beforeRows(names, change, previous.to);
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
