import { t } from '../i18n';
import { rawValueLines, typeOfAnnotation, type Annotation, type Project } from '../model';
import { annotationDisplayName, displayLines, issueMessage, issuesOf } from './typedText';

/** Ícone de alerta de anotação incompleta, com os motivos no `title`. */
export function IssueBadge({
  project,
  annotation,
}: {
  readonly project: Project;
  readonly annotation: Annotation;
}) {
  const issues = issuesOf(project, annotation.id);
  if (issues.length === 0) return null;
  const reasons = issues.map((i) => issueMessage(project, annotation, i)).join('\n');
  return (
    <span
      class="issue-badge"
      role="img"
      aria-label={`${t('issue.badge')}: ${reasons}`}
      title={`${t('issue.badge')}\n${reasons}`}
    >
      ⚠
    </span>
  );
}

/** Lista dos motivos de uma anotação incompleta. */
export function IssueList({
  project,
  annotation,
}: {
  readonly project: Project;
  readonly annotation: Annotation;
}) {
  const issues = issuesOf(project, annotation.id);
  if (issues.length === 0) return null;
  return (
    <div class="issues" role="status">
      <strong>⚠ {t('issue.heading')}</strong>
      <ul>
        {issues.map((issue, i) => (
          <li key={i}>{issueMessage(project, annotation, issue)}</li>
        ))}
      </ul>
    </div>
  );
}

interface AnnotationLinesProps {
  readonly project: Project;
  readonly annotation: Annotation;
  /** Classe de cada linha (a Lista e as Herdadas têm estilos próprios). */
  readonly lineClass: string;
  readonly keyClass?: string;
}

/**
 * Valores da anotação, somente leitura: na tipada, os campos na ordem do tipo
 * (tabelas completas, referências como `→ User.name`); na livre, os pares.
 */
export function AnnotationLines({
  project,
  annotation,
  lineClass,
  keyClass,
}: AnnotationLinesProps) {
  if (!annotation.type) {
    return (
      <>
        {annotation.entries.map((e) => (
          <span key={e.id} class={lineClass}>
            <span class={keyClass}>{e.key}:</span> {e.value}
          </span>
        ))}
      </>
    );
  }
  if (!typeOfAnnotation(project, annotation)) {
    return (
      <>
        {rawValueLines(annotation).map((line) => (
          <span key={line.key} class={lineClass}>
            <span class={keyClass}>{line.key}:</span> {line.text}
          </span>
        ))}
      </>
    );
  }
  return (
    <>
      {displayLines(project, annotation, 'full').map((line) =>
        line.kind === 'value' ? (
          <span
            key={line.key}
            class={line.alert ? `${lineClass} value-alert` : lineClass}
          >
            <span class={keyClass}>{line.label}:</span> {line.text}
          </span>
        ) : (
          <span key={line.key} class={lineClass}>
            <span class={keyClass}>{line.label}:</span>
            <span
              class={line.alert ? 'mini-table value-alert' : 'mini-table'}
              role="table"
              aria-label={line.label}
              style={{ '--cols': line.columns.length }}
            >
              <span class="mini-row" role="row">
                {line.columns.map((c) => (
                  <span key={c.key} class="mini-head" role="columnheader">
                    {c.label}
                  </span>
                ))}
              </span>
              {line.rows.map((row) => (
                <span key={row.id} class="mini-row" role="row">
                  {row.cells.map((cell, i) => (
                    <span key={i} class="mini-cell" role="cell">
                      {cell}
                    </span>
                  ))}
                </span>
              ))}
            </span>
          </span>
        ),
      )}
    </>
  );
}

/** Título da anotação: tipo + rótulo na tipada; nome (ou primeiro par) na livre. */
export function AnnotationTitle({
  project,
  annotation,
  class: className,
}: {
  readonly project: Project;
  readonly annotation: Annotation;
  readonly class?: string;
}) {
  return (
    <strong class={className}>
      <IssueBadge project={project} annotation={annotation} />
      {annotationDisplayName(project, annotation)}
    </strong>
  );
}
