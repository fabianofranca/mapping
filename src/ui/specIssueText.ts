import { modelMessage, isModelMessageTemplateCode } from '../model';
import { messageText } from './modelMessage';

/**
 * The translated text of a specialization problem: with a catalog `code`, in the app's language
 * (`messageText`); without it, the model's own `message`.
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
