// The built-in names (`font-sans`, `font-mono`) of a component's own lookup answer with the host's fonts.
import { describe, expect, it } from 'vitest';
import {
  createTokenTables,
  ownNamedLookup,
  resolveTokens,
} from '../../../src/model/components/tokens';

describe('ownNamedLookup with host fonts', () => {
  it('answers font-sans and font-mono from the resolved table, not the default stacks', () => {
    const tokens = { values: { primary: '#112233' } };
    const host = { sans: 'Inter', mono: 'Fira Code' };
    const tables = createTokenTables(tokens, host);
    const lookup = ownNamedLookup(resolveTokens(tokens, host), tables);
    expect(lookup('font-sans', 'family')).toContain('Inter');
    expect(lookup('font-mono', 'family')).toContain('Fira Code');
  });

  it('keeps the default stacks without a host', () => {
    const lookup = ownNamedLookup(resolveTokens(undefined, {}), undefined);
    expect(lookup('font-sans', 'family')).toContain('Mapping Sans');
  });
});
