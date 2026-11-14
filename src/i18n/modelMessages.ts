// Model messages that the interface translates (`ModelMessage`: code + parameters; see
// `src/model/modelMessage.ts`). The key is `model.<code>`. They enter the dictionaries through
// `...modelMessagesEnUS` / `...modelMessagesPtBR`. en-US is the base: it defines the keys (the
// template codes of the model plus the ones written below) and pt-BR is typed against it, with the
// same keys and the same {parameters}. The model returns the English `text` (what the MCP and the
// model tests read); the pt-BR templates of the catalog codes live in `modelMessagesTemplatesPtBR.ts`.

import {
  MODEL_MESSAGE_TEMPLATES,
  type ModelMessageTemplateCode,
} from '../model/messages';
import { templatePtBR } from './modelMessagesTemplatesPtBR';

/** The `model.<code>` keys of the model catalog, with its English text (the text is not repeated). */
const templateEnUS = Object.fromEntries(
  Object.entries(MODEL_MESSAGE_TEMPLATES).map(([code, text]) => [`model.${code}`, text]),
) as { readonly [C in ModelMessageTemplateCode as `model.${C}`]: string };

export const modelMessagesEnUS = {
  ...templateEnUS,
  // Catalog (src/model/catalog.ts)
  'model.catalog.fileMissing': 'missing file ({path})',
  'model.catalog.invalidComponent': 'invalid component',
  'model.catalog.typeOutside': 'type "{typeId}" is outside the specialization',
  'model.catalog.typeNoComponent': 'type "{typeId}" has no component',
  'model.catalog.invalidProblem': '{at}{reason}',
  // Arrange (src/model/componentArrange.ts)
  'model.arrange.overflow': '{label}: content is larger than the container',
  'model.arrange.outside': '{label}: does not fit in {where}',
  // References in the drawing values (src/model/componentValues.ts)
  'model.value.refBroken': 'broken reference: {key}',
  'model.value.refCycle': 'reference cycle: {key}',
  'model.value.refDeep': 'reference through more than one level: {key}',
  // Loading the specialization components (src/model/componentCatalog.ts)
  'model.components.outsideLibrary': '{typeId}: path outside the library: {path}',
  'model.components.fileMissing': '{typeId}: missing file ({path})',
  'model.components.invalid': '{typeId}: {at}{reason}',
  'model.components.invalidFallback': '{typeId}: invalid component',
  'model.icons.outsideLibrary': 'icons: path outside the library: {path}',
  'model.icons.fileMissing': 'icons: missing file ({path})',
  'model.icons.invalid': 'icons: {at}{reason}',
  'model.icons.invalidFallback': 'icons: invalid icon set',
} as const satisfies {
  // Every template code of the model has an en-US text (the extra keys above are allowed).
  readonly [C in ModelMessageTemplateCode as `model.${C}`]: string;
} & Readonly<Record<string, string>>;

/** The known codes (the key without the `model.` prefix). */
export type ModelMessageCode = keyof typeof modelMessagesEnUS extends infer K
  ? K extends `model.${infer C}`
    ? C
    : never
  : never;

export const modelMessagesPtBR: Record<keyof typeof modelMessagesEnUS, string> = {
  ...templatePtBR,
  'model.catalog.fileMissing': 'arquivo ausente ({path})',
  'model.catalog.invalidComponent': 'componente inválido',
  'model.catalog.typeOutside': 'tipo "{typeId}" fora da especialização',
  'model.catalog.typeNoComponent': 'tipo "{typeId}" sem componente',
  'model.catalog.invalidProblem': '{at}{reason}',
  'model.arrange.overflow': '{label}: conteúdo maior que o container',
  'model.arrange.outside': '{label}: não cabe em {where}',
  'model.value.refBroken': 'referência quebrada: {key}',
  'model.value.refCycle': 'referência em ciclo: {key}',
  'model.value.refDeep': 'referência em mais de um nível: {key}',
  'model.components.outsideLibrary': '{typeId}: caminho fora da biblioteca: {path}',
  'model.components.fileMissing': '{typeId}: arquivo ausente ({path})',
  'model.components.invalid': '{typeId}: {at}{reason}',
  'model.components.invalidFallback': '{typeId}: componente inválido',
  'model.icons.outsideLibrary': 'icons: caminho fora da biblioteca: {path}',
  'model.icons.fileMissing': 'icons: arquivo ausente ({path})',
  'model.icons.invalid': 'icons: {at}{reason}',
  'model.icons.invalidFallback': 'icons: conjunto de ícones inválido',
};
