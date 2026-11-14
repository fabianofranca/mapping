import { t, type TranslationKey } from '../i18n';
import type { ModelMessageCode } from '../i18n/modelMessages';
import { MODEL_MESSAGE_TEMPLATES, RAW_MESSAGE_CODE, type ModelMessage } from '../model';

// Text of a model message in the interface language: the known code becomes
// `t('model.<code>', params)`; `raw` (and any code without a translation) stays as text.

const HAND_WRITTEN: readonly ModelMessageCode[] = [
  'catalog.fileMissing',
  'catalog.invalidComponent',
  'catalog.typeOutside',
  'catalog.typeNoComponent',
  'catalog.invalidProblem',
  'arrange.overflow',
  'arrange.outside',
  'value.refBroken',
  'value.refCycle',
  'value.refDeep',
  'components.outsideLibrary',
  'components.fileMissing',
  'components.invalid',
  'components.invalidFallback',
  'icons.outsideLibrary',
  'icons.fileMissing',
  'icons.invalid',
  'icons.invalidFallback',
];

// Those of the model catalog (`src/model/messages/`) are read from there, not listed by hand.
const CODES: ReadonlySet<string> = new Set<string>([
  ...HAND_WRITTEN,
  ...Object.keys(MODEL_MESSAGE_TEMPLATES),
]);

export function messageText(message: ModelMessage): string {
  if (message.code === RAW_MESSAGE_CODE || !CODES.has(message.code)) return message.text;
  const params =
    message.detail === undefined
      ? message.params
      : { ...message.params, reason: messageText(message.detail) };
  return t(`model.${message.code}` as TranslationKey, params);
}
