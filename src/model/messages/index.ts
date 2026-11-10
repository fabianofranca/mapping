import { modelMessage, type ModelMessage } from '../modelMessage';
import { libraryMessages } from './library';
import { specMessages } from './spec';

// Catálogo das mensagens do modelo que a interface traduz (etapa #1263). Cada módulo da pasta é
// uma área (`library.ts`, ...) e exporta código → modelo do texto pt-BR de hoje, com
// `{parâmetros}`. A interface monta o pt-BR dos dicionários daqui (`src/i18n/modelMessages.ts`),
// então o texto em pt-BR é igual ao do modelo por construção. Sem DOM.

export const MODEL_MESSAGE_TEMPLATES = {
  ...libraryMessages,
  ...specMessages,
} as const;

export type ModelMessageTemplateCode = keyof typeof MODEL_MESSAGE_TEMPLATES;

export function isModelMessageTemplateCode(
  code: string,
): code is ModelMessageTemplateCode {
  return Object.hasOwn(MODEL_MESSAGE_TEMPLATES, code);
}

/** Troca literal de `{nome}` pelo valor (sem plural nem concordância); nome sem valor fica como está. */
export function fillTemplate(
  template: string,
  params: Readonly<Record<string, string | number>>,
): string {
  return template.replace(/\{(\w+)\}/g, (match, name: string) => {
    const value = params[name];
    return value === undefined ? match : String(value);
  });
}

/** A mensagem do catálogo com os parâmetros no texto pt-BR (`code`, `params`, `text`). */
export function templateMessage(
  code: ModelMessageTemplateCode,
  params: Readonly<Record<string, string | number>> = {},
): ModelMessage {
  return modelMessage(code, params, fillTemplate(MODEL_MESSAGE_TEMPLATES[code], params));
}
