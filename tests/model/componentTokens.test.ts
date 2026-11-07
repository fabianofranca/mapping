// CF5: o catálogo e a biblioteca põem os tokens do modo (e a fonte do hospedeiro) no componente.
import { describe, expect, it } from 'vitest';
import { loadLibrary, withHostTokens } from '../../src/model/components/library';
import { loadSpecComponents } from '../../src/model';
import { SPEC_FILE, packageTexts, testSpec } from './componentFixtures';

const texts = packageTexts();
const read = (path: string) => texts.get(path) ?? undefined;

describe('loadSpecComponents com a fonte do hospedeiro', () => {
  it('cada componente leva os tokens do modo, com font-sans e font-mono do hospedeiro', () => {
    const loaded = loadSpecComponents(testSpec(), SPEC_FILE, 1, read, {
      fonts: { sans: 'Tema Sans', mono: 'Tema Mono' },
    });
    const files = [...loaded.byType.values()];
    expect(files.length).toBeGreaterThan(0);
    for (const file of files) {
      expect(file.resolvedTokens?.['font-sans']).toBe('Tema Sans');
      expect(file.resolvedTokens?.['font-mono']).toBe('Tema Mono');
    }
  });

  it('sem hospedeiro os padrões são sans-serif e monospace', () => {
    const loaded = loadSpecComponents(testSpec(), SPEC_FILE, 1, read);
    const file = [...loaded.byType.values()][0];
    expect(file?.resolvedTokens).toMatchObject({
      'font-sans': 'sans-serif',
      'font-mono': 'monospace',
    });
  });

  it('os tokens da especialização entram no modo pedido (ou no primeiro)', () => {
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

  it('a biblioteca guarda os tokens da especialização', () => {
    expect(loadLibrary(files).tokens?.modes).toEqual(['light', 'dark']);
  });

  it('withHostTokens põe a fonte do hospedeiro e a da especialização vence', () => {
    const lib = withHostTokens(loadLibrary(files), {
      sans: 'Tema Sans',
      mono: 'Tema Mono',
    });
    const tokens = lib.types[0]?.component?.resolvedTokens;
    expect(tokens?.['font-sans']).toBe('Spec Sans');
    expect(tokens?.['font-mono']).toBe('Tema Mono');
  });
});
