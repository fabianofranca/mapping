import { t } from '../i18n';

/** "N items", "1 item" or "empty": how many top-level items a page holds. */
export function pageItemsText(count: number): string {
  if (count === 0) return t('page.count.empty');
  return count === 1 ? t('page.count.itemsOne') : t('page.count.items', { count });
}
