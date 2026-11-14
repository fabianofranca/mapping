import { t } from '../i18n';
import {
  isModelMessageTemplateCode,
  modelMessage,
  type ModelMessageTemplateCode,
} from '../model';
import { messageText } from './modelMessage';
import { specIssueText } from './specIssueText';
import type { AppLibraryIssue } from '../storage/specPackage';

/** The message with a catalog code: the `detail` (from another module) goes into `{reason}`. */
function coded(issue: AppLibraryIssue, code: ModelMessageTemplateCode): string {
  return messageText(modelMessage(code, issue.params ?? {}, issue.message, issue.detail));
}

/** Text of the problem: those with a code come translated; the rest comes from the validator. */
export function issueText(issue: AppLibraryIssue): string {
  if (issue.code === 'package-too-big') return t('library.packageTooBig');
  if (issue.code !== undefined && isModelMessageTemplateCode(issue.code)) {
    return coded(issue, issue.code);
  }
  return specIssueText(issue);
}

/** Groups by file, in the order in which each file first appears. */
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
 * Problems of a library (errors and warnings) in a compact list: one group per file, with
 * the path inside the file and the message. The list scrolls by itself, so 42 warnings do not
 * stretch the dialog nor Diagnostics.
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
