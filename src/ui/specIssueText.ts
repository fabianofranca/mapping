import { t } from '../i18n';
import type { SpecIssueCode } from '../model';

/**
 * O texto traduzido dos problemas da especialização que têm `code` (os exemplos com linhas de
 * `table`); sem `code` conhecido, o `message` em português do modelo.
 */
export function specIssueText(issue: {
  readonly code?: string | undefined;
  readonly params?: Readonly<Record<string, string | number>> | undefined;
  readonly message: string;
}): string {
  switch (issue.code as SpecIssueCode | undefined) {
    case 'example-not-column':
      return t('library.exampleNotColumn', {
        key: issue.params?.key ?? '',
        field: issue.params?.field ?? '',
      });
    case 'example-row-not-object':
      return t('library.exampleRowNotObject');
    case 'example-ref-cell':
      return t('library.exampleRefCell');
    case 'example-table-needs-rows':
      return t('library.exampleTableNeedsRows');
    default:
      return issue.message;
  }
}
