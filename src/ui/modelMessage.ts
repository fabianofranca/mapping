import { t, type TranslationKey } from '../i18n';
import type { ModelMessageCode } from '../i18n/modelMessages';
import { MODEL_MESSAGE_TEMPLATES, RAW_MESSAGE_CODE, type ModelMessage } from '../model';

// Texto de uma mensagem do modelo no idioma da interface: o código conhecido vira
// `t('model.<código>', params)`; `raw` (e qualquer código sem tradução) segue em texto.

const HAND_WRITTEN: readonly ModelMessageCode[] = [
  'catalog.fileMissing',
  'catalog.invalidComponent',
  'catalog.typeOutside',
  'catalog.typeNoComponent',
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

// Os do catálogo do modelo (`src/model/messages/`) são lidos de lá, não listados à mão.
const CODES: ReadonlySet<string> = new Set<string>([
  ...HAND_WRITTEN,
  ...Object.keys(MODEL_MESSAGE_TEMPLATES),
]);

export function messageText(message: ModelMessage): string {
  if (message.code === RAW_MESSAGE_CODE || !CODES.has(message.code)) return message.text;
  return t(`model.${message.code}` as TranslationKey, message.params);
}
