import { describe, expect, it } from 'vitest';
import { matchesSearch, normalizeSearch } from '../../src/utils/search';

describe('search', () => {
  it('ignores accents and case (pt-BR text)', () => {
    // pt-BR kept: accent normalization of Portuguese text is the object
    expect(normalizeSearch('Ação Ñandú')).toBe('acao nandu');
    expect(matchesSearch('Especialização de dados', 'ESPECIALIZACAO')).toBe(true);
  });

  it('requires all the words, in any order', () => {
    expect(matchesSearch('Red car', 'car red')).toBe(true);
    expect(matchesSearch('Red car', 'car blue')).toBe(false);
  });

  it('an empty query matches everything', () => {
    expect(matchesSearch('anything', '')).toBe(true);
    expect(matchesSearch('anything', '   ')).toBe(true);
  });
});
