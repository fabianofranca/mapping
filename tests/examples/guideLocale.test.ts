import { describe, expect, it } from 'vitest';
import { pickLocale } from '../../scripts/guide/pickLocale';
import { detectLocale, isLocale } from '../../src/store/settings';

// The guide picks its language like the app: the saved `mapping.locale` if valid, else the
// browser language. `pickLocale` is inlined in the page by scripts/guide.ts, so it is tested here.

const LANGUAGES: readonly (string | undefined)[] = [
  'pt',
  'pt-BR',
  'pt-PT',
  'PT-br',
  'en-US',
  'en-GB',
  'es',
  'fr',
  '',
  undefined,
];
const STORED: readonly (string | null | undefined)[] = [
  null,
  undefined,
  '',
  'pt-BR',
  'en-US',
  'fr',
  'pt',
  'EN-US',
];

describe('pickLocale', () => {
  it('without a saved language, follows the browser language like detectLocale', () => {
    for (const language of LANGUAGES) {
      expect(pickLocale(null, language), String(language)).toBe(detectLocale(language));
    }
  });

  it('a valid saved language wins over the browser language, an invalid one is ignored', () => {
    for (const stored of STORED) {
      for (const language of LANGUAGES) {
        const expected = isLocale(stored) ? stored : detectLocale(language);
        expect(pickLocale(stored, language), `${stored} / ${language}`).toBe(expected);
      }
    }
  });

  it('table of known answers', () => {
    expect(pickLocale(null, 'pt-PT')).toBe('pt-BR');
    expect(pickLocale(null, 'en-GB')).toBe('en-US');
    expect(pickLocale(null, 'es')).toBe('en-US');
    expect(pickLocale(null, undefined)).toBe('en-US');
    expect(pickLocale('pt-BR', 'en-US')).toBe('pt-BR');
    expect(pickLocale('en-US', 'pt-BR')).toBe('en-US');
    expect(pickLocale('fr', 'pt-BR')).toBe('pt-BR');
  });
});
