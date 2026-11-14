import type { LibraryIssue } from './library';
import { templateMessage, type ModelMessageTemplateCode } from './messages';
import type { ModelMessage } from './modelMessage';

/**
 * Library issue built by the message catalog (`src/model/messages/`): the `message` is the
 * usual default text; `code`, `params` and `detail` go on to the interface to translate. The
 * `detail` is the message of another module that goes into the `{reason}` of the outer text.
 * Rule: with `detail`, `params` does not carry `reason`; the inner text only goes into the
 * `message` (here) and stays in `detail`, which the interface translates.
 */
export function libraryIssue(
  severity: LibraryIssue['severity'],
  file: string,
  path: string,
  code: ModelMessageTemplateCode,
  params: Readonly<Record<string, string | number>> = {},
  detail?: ModelMessage,
): LibraryIssue {
  const filled = detail === undefined ? params : { ...params, reason: detail.text };
  return {
    file,
    path,
    message: templateMessage(code, filled).text,
    severity,
    code,
    params,
    ...(detail === undefined ? {} : { detail }),
  };
}
