import { t } from '../i18n';
import type { ActionResult } from '../store/history';

/**
 * The message of a refused page operation (name empty or taken, last page), or the generic one.
 * `name` is the one the person typed (it goes into "already exists").
 */
export function pageErrorMessage(
  result: Extract<ActionResult, { ok: false }>,
  name: string,
): string {
  switch (result.error) {
    case 'page-name-empty':
      return t('page.error.nameEmpty');
    case 'page-name-taken':
      return t('page.error.nameTaken', { name: name.trim() });
    case 'page-last':
      return t('page.error.last');
    default:
      return t('page.error.generic');
  }
}
