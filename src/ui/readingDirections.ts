import { t } from '../i18n';
import type { ReadingDirection } from '../model';

/** Full name of a reading direction ("Left to right"). */
export function directionLabel(direction: ReadingDirection): string {
  return t(direction === 'rtl' ? 'direction.rtl' : 'direction.ltr');
}
