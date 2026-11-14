// The language of the interactive guide, chosen like the app does (`src/store/settings.ts`): the
// saved `mapping.locale` if it is valid, else `navigator.language` (starts with `pt` → pt-BR,
// anything else → en-US). This file is inlined in the page by `scripts/guide.ts` (types and
// `export` stripped), so it must stay a single self-contained function with no imports.
export type GuideLocale = 'en-US' | 'pt-BR';

export function pickLocale(
  stored: string | null | undefined,
  language: string | undefined,
): GuideLocale {
  if (stored === 'pt-BR' || stored === 'en-US') return stored;
  return language?.toLowerCase().startsWith('pt') ? 'pt-BR' : 'en-US';
}
