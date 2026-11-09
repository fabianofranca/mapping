import { t } from '../i18n';

/** A mensagem de erro do nome de uma perspectiva (vazio ou repetido). */
export function perspectiveNameMessage(issue: 'empty' | 'taken', name: string): string {
  return issue === 'empty'
    ? t('perspective.new.nameEmpty')
    : t('perspective.new.nameTaken', { name: name.trim() });
}
