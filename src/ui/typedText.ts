// Textos das anotações tipadas (títulos, valores, pendências), sempre via `t()`.
import { t, type TranslationKey } from '../i18n';
import {
  annotationShortLabel,
  annotationTitle,
  fieldLabel,
  getProjectIssues,
  ownerTypesOf,
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

export function displayTexts(): DisplayTexts {
  return {
    ...labelTexts(),
    empty: t('typed.empty'),
    rows: (count) => (count === 1 ? t('typed.rowsOne') : t('typed.rowsMany', { count })),
  };
}

/**
 * Nome exibido da anotação: na tipada, "Button · Comprar" (ou só "Button"); na
 * livre, o nome ou o primeiro par.
 */
export function annotationDisplayName(p: Project, a: Annotation): string {
  return a.type ? (annotationTitle(p, a) ?? '') : annotationLabel(a);
}

/** Rótulo curto de quem faz uma referência, ex.: "Input input_nome". */
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

const issuesCache = new WeakMap<Project, Map<string, AnnotationIssue[]>>();

/** Pendências do projeto, calculadas uma vez por versão do projeto. */
export function projectIssues(p: Project): ReadonlyMap<string, AnnotationIssue[]> {
  let issues = issuesCache.get(p);
  if (!issues) {
    issues = getProjectIssues(p);
    issuesCache.set(p, issues);
  }
  return issues;
}

export function issuesOf(p: Project, annotationId: string): readonly AnnotationIssue[] {
  return projectIssues(p).get(annotationId) ?? [];
}

/** Nomes dos tipos que podem ser donos, ex.: "Button ou Image". */
export function ownerTypeNames(p: Project, a: Pick<Annotation, 'type'>): string {
  if (!a.type) return '';
  return ownerTypesOf(p, a.type)
    .map((type) => type.name)
    .join(t('typed.ownersJoin'));
}

/** Motivo da pendência, com o campo (e a linha/coluna da tabela) envolvido. */
export function issueMessage(p: Project, a: Annotation, issue: AnnotationIssue): string {
  const reason = t(`issue.${issue.code}` satisfies TranslationKey, {
    owners: ownerTypeNames(p, a),
  });
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
