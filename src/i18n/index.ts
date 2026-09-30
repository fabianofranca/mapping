import { locale, type Locale } from '../store/settings';
import { enUS } from './en-US';
import { ptBR, type Dictionary } from './pt-BR';

export type TranslationKey = keyof Dictionary;

const dictionaries: Record<Locale, Dictionary> = { 'pt-BR': ptBR, 'en-US': enUS };

/**
 * Texto traduzido. `{nome}` no texto é trocado por `params.nome`.
 * Lê o signal `locale`, então componentes que chamam `t()` re-renderizam ao trocar o idioma.
 */
export function t(key: TranslationKey, params?: Record<string, string | number>): string {
  const text = dictionaries[locale.value][key];
  if (!params) return text;
  return text.replace(/\{(\w+)\}/g, (match, name: string) =>
    name in params ? String(params[name]) : match,
  );
}
