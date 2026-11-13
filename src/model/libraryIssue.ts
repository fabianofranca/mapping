import type { LibraryIssue } from './library';
import { templateMessage, type ModelMessageTemplateCode } from './messages';
import type { ModelMessage } from './modelMessage';

/**
 * Problema da biblioteca montado pelo catálogo de mensagens (`src/model/messages/`): o `message`
 * é o texto pt-BR de sempre; `code`, `params` e `detail` seguem para a interface traduzir. O
 * `detail` é a mensagem de outro módulo que entra no `{reason}` do texto de fora. Regra: com
 * `detail`, `params` não leva `reason`; o texto de dentro só entra no `message` (aqui) e fica
 * em `detail`, que a interface traduz.
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
