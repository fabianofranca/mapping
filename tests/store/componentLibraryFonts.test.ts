// CF5: the app catalog puts on the components the --font-sans/--font-mono stack read from the theme.
import { afterEach, describe, expect, it } from 'vitest';
import { readSpecComponents } from '../../src/store/componentLibrary';
import { SPEC_FILE, packageTexts, testSpec } from '../model/componentFixtures';

const texts = packageTexts();

afterEach(() => {
  document.documentElement.style.removeProperty('--font-sans');
  document.documentElement.style.removeProperty('--font-mono');
});

describe('readSpecComponents: host font', () => {
  it('the components carry the font-sans and the font-mono of the theme', async () => {
    document.documentElement.style.setProperty('--font-sans', 'Theme Sans, sans-serif');
    document.documentElement.style.setProperty('--font-mono', 'Theme Mono, monospace');
    const loaded = await readSpecComponents(
      testSpec(),
      SPEC_FILE,
      1,
      async (path) => texts.get(path) ?? null,
    );
    const file = [...loaded.byType.values()][0];
    expect(file?.resolvedTokens?.['font-sans']).toBe('Theme Sans, sans-serif');
    expect(file?.resolvedTokens?.['font-mono']).toBe('Theme Mono, monospace');
  });
});
