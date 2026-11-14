import { modelMessage, type ModelMessage } from '../modelMessage';
import { componentMessages } from './component';
import { engineMessages } from './engine';
import { iconsFileMessages } from './icons';
import { libraryMessages } from './library';
import { originMessages } from './origins';
import { specMessages } from './spec';
import { versionMessages } from './versions';

// Catalog of the model messages that the interface translates (stage #1263). Each module in the
// folder is an area (`library.ts`, ...) and exports code → template of today's pt-BR text, with
// `{parameters}`. The interface builds the pt-BR of the dictionaries from here
// (`src/i18n/modelMessages.ts`), so the pt-BR text equals the model's by construction. No DOM.

export const MODEL_MESSAGE_TEMPLATES = {
  ...libraryMessages,
  ...specMessages,
  ...versionMessages,
  ...componentMessages,
  ...iconsFileMessages,
  ...originMessages,
  ...engineMessages,
} as const;

export type ModelMessageTemplateCode = keyof typeof MODEL_MESSAGE_TEMPLATES;

export function isModelMessageTemplateCode(
  code: string,
): code is ModelMessageTemplateCode {
  return Object.hasOwn(MODEL_MESSAGE_TEMPLATES, code);
}

/** Literal replacement of `{name}` by the value (no plural or agreement); a name without a value stays as is. */
export function fillTemplate(
  template: string,
  params: Readonly<Record<string, string | number>>,
): string {
  return template.replace(/\{(\w+)\}/g, (match, name: string) => {
    const value = params[name];
    return value === undefined ? match : String(value);
  });
}

/** The catalog message with the parameters in the pt-BR text (`code`, `params`, `text`). */
export function templateMessage(
  code: ModelMessageTemplateCode,
  params: Readonly<Record<string, string | number>> = {},
): ModelMessage {
  return modelMessage(code, params, fillTemplate(MODEL_MESSAGE_TEMPLATES[code], params));
}
