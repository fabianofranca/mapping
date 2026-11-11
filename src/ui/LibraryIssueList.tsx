import { t } from '../i18n';
import {
  isModelMessageTemplateCode,
  modelMessage,
  type ModelMessageTemplateCode,
} from '../model';
import { messageText } from './modelMessage';
import { specIssueText } from './specIssueText';
import type { AppLibraryIssue } from '../storage/specPackage';

/** A mensagem com código do catálogo: o `detail` (de outro módulo) entra no `{reason}`. */
function coded(issue: AppLibraryIssue, code: ModelMessageTemplateCode): string {
  return messageText(modelMessage(code, issue.params ?? {}, issue.message, issue.detail));
}

/** Texto do problema: os que têm código saem traduzidos; o resto vem do validador. */
export function issueText(issue: AppLibraryIssue): string {
  if (issue.code === 'package-too-big') return t('library.packageTooBig');
  if (issue.code !== undefined && isModelMessageTemplateCode(issue.code)) {
    return coded(issue, issue.code);
  }
  return specIssueText(issue);
}

/** Agrupa por arquivo, na ordem em que cada arquivo aparece pela primeira vez. */
function groupByFile(
  issues: readonly AppLibraryIssue[],
): readonly (readonly [string, readonly AppLibraryIssue[]])[] {
  const groups = new Map<string, AppLibraryIssue[]>();
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
  readonly issues: readonly AppLibraryIssue[];
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
                {issue.path !== '' && <code>{issue.path}</code>} {issueText(issue)}
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
