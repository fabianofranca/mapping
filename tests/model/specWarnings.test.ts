import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseSpecText, specWarnings, type Spec } from '../../src/model';

// Avisos de uma especialização válida (etapa 4.2): não impedem a importação.

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function load(path: string, edit?: (spec: Record<string, any>) => void): Spec {
  const raw = JSON.parse(readFileSync(path, 'utf8')) as Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
  edit?.(raw);
  const parsed = parseSpecText(JSON.stringify(raw));
  if (!parsed.ok) throw new Error(parsed.errors.join('\n'));
  return parsed.spec;
}

describe('specWarnings', () => {
  it('os exemplos do repositório só têm o aviso do tipo sem code (screen)', () => {
    expect(specWarnings(load('examples/specs/modelo-de-dados.json'))).toEqual([]);
    expect(specWarnings(load('examples/specs/sdui.json'))).toEqual([
      expect.objectContaining({
        code: 'type-without-code',
        path: 'layers[2].annotationTypes[0]',
      }),
    ]);
  });

  it('plataforma declarada e não usada (nem em code, nem em campo codeRef)', () => {
    const spec = load('examples/specs/sdui.json', (raw) => {
      raw.platforms.push({ id: 'web', name: 'Web' });
    });
    const unused = specWarnings(spec).filter((w) => w.code === 'unused-platform');
    expect(unused).toEqual([expect.objectContaining({ path: 'platforms[3]' })]);
  });

  it('uma plataforma só citada em um campo codeRef conta como usada', () => {
    const spec = load('examples/specs/sdui.json', (raw) => {
      raw.platforms.push({ id: 'web', name: 'Web' });
      const screen = raw.layers[2].annotationTypes[0];
      screen.fields.find((f: { type: string }) => f.type === 'codeRef').platforms = [
        'web',
      ];
    });
    expect(specWarnings(spec).filter((w) => w.code === 'unused-platform')).toEqual([]);
  });

  it('sem plataformas declaradas, tipo sem code não é descuido', () => {
    const spec = load('examples/specs/modelo-de-dados.json', (raw) => {
      raw.layers[0].annotationTypes[0].code = undefined;
    });
    expect(specWarnings(spec)).toEqual([]);
  });

  it('o format antigo avisa', () => {
    const spec = load('examples/specs/modelo-de-dados.json', (raw) => {
      raw.format = 'mapeador-spec';
    });
    expect(specWarnings(spec)).toEqual([
      expect.objectContaining({ code: 'legacy-format' }),
    ]);
  });
});
