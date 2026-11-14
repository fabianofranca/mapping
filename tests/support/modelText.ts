import { fillTemplate } from '../../src/model/messages';
import { RAW_MESSAGE_CODE, type ModelMessage } from '../../src/model/modelMessage';
import { modelMessagesPtBR } from '../../src/i18n/modelMessages';
import { templatePtBR } from '../../src/i18n/modelMessagesTemplatesPtBR';

/**
 * The pt-BR rendering of a model message as the pt-BR templates define it: `templatePtBR` of the
 * code filled with the params (and the inner message in `{reason}`). The model `text` is English
 * and equals the en-US rendering, so the pt-BR one is only reachable through the templates.
 */
export function ptBRText(message: ModelMessage): string {
  const key = `model.${message.code}`;
  // The catalog codes come from `templatePtBR`; the few hand-written ones, from the pt-BR dictionary.
  const template =
    (templatePtBR as Readonly<Record<string, string | undefined>>)[key] ??
    (modelMessagesPtBR as Readonly<Record<string, string | undefined>>)[key];
  if (message.code === RAW_MESSAGE_CODE || template === undefined) return message.text;
  const params =
    message.detail === undefined
      ? message.params
      : { ...message.params, reason: ptBRText(message.detail) };
  return fillTemplate(template, params);
}
