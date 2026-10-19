import { t } from '../i18n';
import type { LibraryIssue } from '../model/library';

/** Agrupa por arquivo, na ordem em que cada arquivo aparece pela primeira vez. */
function groupByFile(
  issues: readonly LibraryIssue[],
): readonly (readonly [string, readonly LibraryIssue[]])[] {
  const groups = new Map<string, LibraryIssue[]>();
  for (const issue of issues) {
    const list = groups.get(issue.file);
    if (list) list.push(issue);
    else groups.set(issue.file, [issue]);
  }
  return [...groups];
}

/**
 * Problemas de uma biblioteca (erros e avisos) em lista compacta: um grupo por arquivo, com
 * o caminho dentro do arquivo e a mensagem. A lista rola sozinha, então 42 avisos não
 * esticam o diálogo nem o Diagnóstico.
 */
export function LibraryIssueList({
  issues,
}: {
  readonly issues: readonly LibraryIssue[];
}) {
  if (issues.length === 0) return null;
  return (
    <div class="library-issues" role="group" aria-label={t('library.issues')}>
      {groupByFile(issues).map(([file, list]) => (
        <section key={file} class="library-issues-group">
          <h4 class="library-issues-file">
            <code>{file === '' ? t('library.package') : file}</code>
            <span class="muted"> ({list.length})</span>
          </h4>
          <ul>
            {list.map((issue, i) => (
              <li key={i} class="library-issue wrap-anywhere">
                <span
                  class={
                    issue.severity === 'error'
                      ? 'badge library-issue-error'
                      : 'badge badge-warning'
                  }
                >
                  {t(issue.severity === 'error' ? 'library.error' : 'library.warning')}
                </span>{' '}
                {issue.path !== '' && <code>{issue.path}</code>} {issue.message}
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
