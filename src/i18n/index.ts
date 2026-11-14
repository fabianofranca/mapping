import { locale, type Locale } from '../store/settings';
import { enUS, type Dictionary } from './en-US';
import { ptBR } from './pt-BR';

export type TranslationKey = keyof Dictionary;

const dictionaries: Record<Locale, Dictionary> = { 'pt-BR': ptBR, 'en-US': enUS };

/**
 * Translated text. `{name}` in the text is replaced by `params.name`.
 * Reads the `locale` signal, so components that call `t()` re-render when the language changes.
 */
export function t(key: TranslationKey, params?: Record<string, string | number>): string {
  const text = dictionaries[locale.value][key];
  if (!params) return text;
  return text.replace(/\{(\w+)\}/g, (match, name: string) =>
    name in params ? String(params[name]) : match,
  );
}
