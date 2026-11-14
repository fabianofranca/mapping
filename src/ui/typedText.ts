// Texts of the typed annotations (titles, values, pending items), always via `t()`.
import { t, type TranslationKey } from '../i18n';
import {
  annotationShortLabel,
  annotationTitle,
  fieldLabel,
  ownerRolesOf,
  ownerTypesOf,
  projectIndex,
  projectIssues as modelProjectIssues,
  tableRows,
  typeOfAnnotation,
  typedDisplayLines,
  type Annotation,
  type AnnotationIssue,
  type DisplayLine,
  type DisplayTexts,
  type LabelTexts,
  type Project,
} from '../model';
import { annotationLabel } from './labels';

export function labelTexts(): LabelTexts {
  return { untitled: t('annotation.untitled'), broken: t('ref.broken') };
}

/** State of the reference button for the accessible name. */
export type RefButtonState =
  | { readonly kind: 'empty' }
  | { readonly kind: 'broken' }
  | { readonly kind: 'value'; readonly value: string; readonly layer?: string };

/**
 * Accessible name of the reference button: starts with the text it shows (WCAG 2.5.3) and
 * ends with the field ("User.name: Target", "Choose: Target", "Broken reference: Target").
 */
export function refButtonName(field: string, state: RefButtonState): string {
  if (state.kind === 'empty') return t('ref.fieldEmpty', { field });
  if (state.kind === 'broken') return t('ref.fieldBroken', { field });
  return state.layer
    ? t('ref.fieldValueLayer', { value: state.value, layer: state.layer, field })
    : t('ref.fieldValue', { value: state.value, field });
}

export function displayTexts(): DisplayTexts {
  return {
    ...labelTexts(),
    empty: t('typed.empty'),
    rows: (count) => (count === 1 ? t('typed.rowsOne') : t('typed.rowsMany', { count })),
  };
}

/**
 * Displayed name of the annotation: for a typed one, "Button · Buy" (or just "Button"); for a
 * free one, the name or the first pair.
 */
export function annotationDisplayName(p: Project, a: Annotation): string {
  return a.type ? (annotationTitle(p, a) ?? '') : annotationLabel(a);
}

/** Short label of whoever makes a reference, e.g. "Input input_name". */
export function annotationSourceLabel(p: Project, a: Annotation): string {
  return annotationShortLabel(p, a, labelTexts());
}

export function displayLines(
  p: Project,
  a: Annotation,
  tables: 'summary' | 'full',
): DisplayLine[] {
  return typedDisplayLines(p, a, { tables, texts: displayTexts() });
}

/** Pending items of the project, computed once per project version. */
export function projectIssues(
  p: Project,
): ReadonlyMap<string, readonly AnnotationIssue[]> {
  return modelProjectIssues(p);
}

export function issuesOf(p: Project, annotationId: string): readonly AnnotationIssue[] {
  return projectIssues(p).get(annotationId) ?? [];
}

/** Names of the types that can be owners, e.g. "Button or Image". */
export function ownerTypeNames(p: Project, a: Pick<Annotation, 'type'>): string {
  if (!a.type) return '';
  return ownerTypesOf(p, a.type)
    .map((type) => type.name)
    .join(t('typed.ownersJoin'));
}

/** Only the reason for the pending item (below the field itself, whose name is already beside it). */
export function issueReason(p: Project, a: Annotation, issue: AnnotationIssue): string {
  const owner =
    a.parentAnnotationId === null
      ? null
      : projectIndex(p).annotations.get(a.parentAnnotationId);
  const offered = owner ? ownerRolesOf(p, owner) : null;
  return t(`issue.${issue.code}` satisfies TranslationKey, {
    owners: ownerTypeNames(p, a),
    label: offered?.label ?? t('typed.roleLabel'),
    roles: (offered?.roles ?? []).map((r) => r.name).join(t('typed.ownersJoin')),
  });
}

/** Reason for the pending item, with the field (and the table row/column) involved. */
export function issueMessage(p: Project, a: Annotation, issue: AnnotationIssue): string {
  const reason = issueReason(p, a, issue);
  if (!issue.key) return reason;
  const type = typeOfAnnotation(p, a)?.type;
  const field = type?.fields.find((f) => f.key === issue.key);
  let where = field ? fieldLabel(field) : issue.key;
  if (issue.rowId !== undefined) {
    const rows = tableRows(a.values?.[issue.key]);
    const row = rows.findIndex((r) => r._id === issue.rowId) + 1;
    const column =
      field?.type === 'table'
        ? field.columns.find((c) => c.key === issue.column)
        : undefined;
    where = t('issue.cell', {
      field: where,
      row,
      column: column ? fieldLabel(column) : (issue.column ?? ''),
    });
  }
  return t('issue.line', { where, reason });
}

/**
 * One-line summary of the annotation (collapsed header): "Review — status: pending".
 * For a free one with no name, the first pair is already the name.
 */
export function annotationSummary(p: Project, a: Annotation): string {
  const name = annotationDisplayName(p, a);
  const values = a.type
    ? displayLines(p, a, 'summary').map((line) =>
        line.kind === 'value' ? `${line.label}: ${line.text}` : line.label,
      )
    : (a.name === null ? a.entries.slice(1) : a.entries).map(
        (e) => `${e.key}: ${e.value}`,
      );
  if (values.length === 0) return name;
  return t('details.summary', {
    name,
    values: values.slice(0, 3).join(t('details.summarySeparator')),
  });
}

/**
 * Link target of a pending item (`data-focus` of the field in the Details): the owner, the role, the table
 * cell or the field; `null` when the pending item does not point to a field.
 */
export function issueFocusKey(issue: AnnotationIssue): string | null {
  if (issue.code === 'missing-owner' || issue.code === 'owner-not-allowed')
    return 'owner';
  if (issue.code === 'missing-role' || issue.code === 'unknown-role') return 'role';
  if (issue.code === 'unknown-field' || !issue.key) return null;
  if (issue.rowId !== undefined)
    return `${issue.key}:${issue.rowId}:${issue.column ?? ''}`;
  return issue.key;
}
