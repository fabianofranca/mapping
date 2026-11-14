import { t } from '../i18n';

/** The error message of a perspective's name (empty or repeated). */
export function perspectiveNameMessage(issue: 'empty' | 'taken', name: string): string {
  return issue === 'empty'
    ? t('perspective.new.nameEmpty')
    : t('perspective.new.nameTaken', { name: name.trim() });
}
