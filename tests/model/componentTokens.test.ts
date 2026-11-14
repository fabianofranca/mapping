// CF5: the catalog and the library put the mode tokens (and the host font) into the component.
import { describe, expect, it } from 'vitest';
import { loadLibrary, withHostTokens } from '../../src/model/components/library';
import { loadSpecComponents } from '../../src/model';
import { SPEC_FILE, packageTexts, testSpec } from './componentFixtures';

const texts = packageTexts();
const read = (path: string) => texts.get(path) ?? undefined;

describe('loadSpecComponents with the host font', () => {
  it('each component carries the mode tokens, with the host font-sans and font-mono', () => {
    const loaded = loadSpecComponents(testSpec(), SPEC_FILE, 1, read, {
      fonts: { sans: 'Theme Sans', mono: 'Theme Mono' },
    });
    const files = [...loaded.byType.values()];
    expect(files.length).toBeGreaterThan(0);
    for (const file of files) {
      expect(file.resolvedTokens?.['font-sans']).toBe('Theme Sans');
      expect(file.resolvedTokens?.['font-mono']).toBe('Theme Mono');
    }
  });

  it('without a host the defaults are sans-serif and monospace', () => {
    const loaded = loadSpecComponents(testSpec(), SPEC_FILE, 1, read);
    const file = [...loaded.byType.values()][0];
    expect(file?.resolvedTokens).toMatchObject({
      'font-sans': 'sans-serif',
      'font-mono': 'monospace',
    });
  });

  it('the specialization tokens go in the requested mode (or the first one)', () => {
    const spec = {
      ...testSpec(),
      tokens: {
        modes: ['light', 'dark'],
        values: { primary: { light: '#111111', dark: '#222222' } },
      },
    };
    const get = (mode?: string) =>
      [...loadSpecComponents(spec, SPEC_FILE, 1, read, { mode }).byType.values()][0]
        ?.resolvedTokens?.primary;
    expect(get('dark')).toBe('#222222');
    expect(get('contrast')).toBe('#111111');
    expect(get()).toBe('#111111');
  });
});

describe('loadLibrary e withHostTokens', () => {
  const files = [
    {
      path: 'l.spec.json',
      text: JSON.stringify({
        format: 'mapping-spec',
        formatVersion: 15,
        id: 'l',
        name: 'L',
        version: 1,
        tokens: { modes: ['light', 'dark'], values: { 'font-sans': 'Spec Sans' } },
        layers: [
          {
            id: 'a',
            name: 'A',
            color: '#112233',
            annotationTypes: [{ id: 't', name: 'T', component: 'c.json', fields: [] }],
          },
        ],
      }),
    },
    {
      path: 'c.json',
      text: JSON.stringify({
        format: 'mapping-component',
        formatVersion: 4,
        id: 'c',
        name: 'C',
        size: { width: 10, height: 10 },
        template: { type: 'frame' },
      }),
    },
  ];

  it('the library keeps the specialization tokens', () => {
    expect(loadLibrary(files).tokens?.modes).toEqual(['light', 'dark']);
  });

  it('withHostTokens sets the host font and the specialization one wins', () => {
    const lib = withHostTokens(loadLibrary(files), {
      sans: 'Theme Sans',
      mono: 'Theme Mono',
    });
    const tokens = lib.types[0]?.component?.resolvedTokens;
    expect(tokens?.['font-sans']).toBe('Spec Sans');
    expect(tokens?.['font-mono']).toBe('Theme Mono');
  });
});
