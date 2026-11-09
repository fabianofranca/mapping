import { t, type TranslationKey } from '../i18n';
import type { ModelMessageCode } from '../i18n/modelMessages';
import { RAW_MESSAGE_CODE, type ModelMessage } from '../model';

// Texto de uma mensagem do modelo no idioma da interface: o código conhecido vira
// `t('model.<código>', params)`; `raw` (e qualquer código sem tradução) segue em texto.

const CODES: ReadonlySet<string> = new Set<ModelMessageCode>([
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
]);

export function messageText(message: ModelMessage): string {
  if (message.code === RAW_MESSAGE_CODE || !CODES.has(message.code)) return message.text;
  return t(`model.${message.code}` as TranslationKey, message.params);
}
