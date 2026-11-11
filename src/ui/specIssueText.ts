import { modelMessage, isModelMessageTemplateCode } from '../model';
import { messageText } from './modelMessage';

/**
 * O texto traduzido de um problema da especialização: com `code` do catálogo, na língua da app
 * (`messageText`); sem ele, o `message` em português do modelo.
 */
export function specIssueText(issue: {
  readonly code?: string | undefined;
  readonly params?: Readonly<Record<string, string | number>> | undefined;
  readonly message: string;
}): string {
  if (issue.code === undefined || !isModelMessageTemplateCode(issue.code)) {
    return issue.message;
  }
  return messageText(modelMessage(issue.code, issue.params ?? {}, issue.message));
}
