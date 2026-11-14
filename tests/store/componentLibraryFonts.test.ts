// CF5: the app catalog puts on the components the --font-sans/--font-mono stack read from the theme.
import { afterEach, describe, expect, it } from 'vitest';
import { readSpecComponents } from '../../src/store/componentLibrary';
import { SPEC_FILE, packageTexts, testSpec } from '../model/componentFixtures';

const texts = packageTexts();

afterEach(() => {
  document.documentElement.style.removeProperty('--font-sans');
  document.documentElement.style.removeProperty('--font-mono');
});

describe('readSpecComponents: fonte do hospedeiro', () => {
  it('os componentes levam o font-sans e o font-mono do tema', async () => {
    document.documentElement.style.setProperty('--font-sans', 'Tema Sans, sans-serif');
    document.documentElement.style.setProperty('--font-mono', 'Tema Mono, monospace');
    const loaded = await readSpecComponents(
      testSpec(),
      SPEC_FILE,
      1,
      async (path) => texts.get(path) ?? null,
    );
    const file = [...loaded.byType.values()][0];
    expect(file?.resolvedTokens?.['font-sans']).toBe('Tema Sans, sans-serif');
    expect(file?.resolvedTokens?.['font-mono']).toBe('Tema Mono, monospace');
  });
});
