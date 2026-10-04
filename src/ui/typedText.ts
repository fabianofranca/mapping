// Textos das anotações tipadas (títulos, valores, pendências), sempre via `t()`.
import { t, type TranslationKey } from '../i18n';
import {
  annotationShortLabel,
  annotationTitle,
  fieldLabel,
  ownerTypesOf,
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

/** Pendências do projeto, calculadas uma vez por versão do projeto. */
export function projectIssues(
  p: Project,
): ReadonlyMap<string, readonly AnnotationIssue[]> {
  return modelProjectIssues(p);
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

/** Só o motivo da pendência (embaixo do próprio campo, o nome dele já está ao lado). */
export function issueReason(p: Project, a: Annotation, issue: AnnotationIssue): string {
  return t(`issue.${issue.code}` satisfies TranslationKey, {
    owners: ownerTypeNames(p, a),
  });
}

/** Motivo da pendência, com o campo (e a linha/coluna da tabela) envolvido. */
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
 * Resumo de uma linha da anotação (cabeçalho recolhido): "Revisão — status: pendente".
 * Na livre sem nome, o primeiro par já é o nome.
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
 * Alvo do link de uma pendência (`data-focus` do campo em Detalhes): o dono, a célula
 * da tabela ou o campo; `null` quando a pendência não aponta um campo.
 */
export function issueFocusKey(issue: AnnotationIssue): string | null {
  if (issue.code === 'missing-owner' || issue.code === 'owner-not-allowed')
    return 'owner';
  if (issue.code === 'unknown-field' || !issue.key) return null;
  if (issue.rowId !== undefined)
    return `${issue.key}:${issue.rowId}:${issue.column ?? ''}`;
  return issue.key;
}
