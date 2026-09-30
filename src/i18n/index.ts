import { locale, type Locale } from '../store/settings';
import { enUS } from './en-US';
import { ptBR, type Dictionary } from './pt-BR';

export type TranslationKey = keyof Dictionary;

const dictionaries: Record<Locale, Dictionary> = { 'pt-BR': ptBR, 'en-US': enUS };

/** Lê o signal `locale`, então componentes que chamam `t()` re-renderizam ao trocar o idioma. */
export function t(key: TranslationKey): string {
  return dictionaries[locale.value][key];
}
