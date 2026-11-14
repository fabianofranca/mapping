import { t } from '../i18n';
import type { ReadingDirection } from '../model';

/** Nome por extenso de uma direção de leitura ("Da esquerda para a direita"). */
export function directionLabel(direction: ReadingDirection): string {
  return t(direction === 'rtl' ? 'direction.rtl' : 'direction.ltr');
}
