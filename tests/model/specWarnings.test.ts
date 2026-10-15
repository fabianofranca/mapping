import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  ignoredFieldWarnings,
  parseSpecText,
  specWarnings,
  type IgnoredSpecField,
  type Spec,
} from '../../src/model';

// Avisos de uma especialização válida (etapa 4.2; o campo ignorado, etapa 9): não impedem a
// importação.

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function parse(path: string, edit?: (spec: Record<string, any>) => void) {
  const raw = JSON.parse(readFileSync(path, 'utf8')) as Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
  edit?.(raw);
  const parsed = parseSpecText(JSON.stringify(raw));
  if (!parsed.ok) throw new Error(parsed.errors.join('\n'));
  return parsed;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function load(path: string, edit?: (spec: Record<string, any>) => void): Spec {
  return parse(path, edit).spec;
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

  it('plataforma declarada e não usada em code', () => {
    const spec = load('examples/specs/sdui.json', (raw) => {
      raw.platforms.push({ id: 'web', name: 'Web' });
    });
    const unused = specWarnings(spec).filter((w) => w.code === 'unused-platform');
    expect(unused).toEqual([expect.objectContaining({ path: 'platforms[3]' })]);
  });

  it('campo do tipo removido (codeRef): aviso com o caminho, logo depois do formato antigo', () => {
    const parsed = parse('examples/specs/sdui.json', (raw) => {
      raw.format = 'mapeador-spec';
      raw.platforms.push({ id: 'web', name: 'Web' });
      raw.layers[2].annotationTypes[0].fields.push({
        key: 'implementacao',
        type: 'codeRef',
        platforms: ['web'],
      });
    });
    const warnings = specWarnings(parsed.spec, parsed.ignored);
    expect(warnings.map((w) => [w.code, w.path])).toEqual([
      ['legacy-format', 'format'],
      ['ignored-field', 'layers[2].annotationTypes[0].fields[2]'],
      ['type-without-code', 'layers[2].annotationTypes[0]'],
      // O `platforms` do campo ignorado não conta mais como uso da plataforma.
      ['unused-platform', 'platforms[3]'],
    ]);
    expect(warnings[1]?.message).toBe(
      'o campo "implementacao" do tipo "screen" é "codeRef", que saiu do formato: foi ignorado (os valores dele não são gravados); remova-o do arquivo',
    );
  });

  it('ignoredFieldWarnings: um aviso por campo, na ordem', () => {
    const ignored: IgnoredSpecField[] = [
      { path: 'layers[0].annotationTypes[0].fields[1]', typeId: 'a', key: 'x' },
      { path: 'layers[1].annotationTypes[2].fields[0]', typeId: 'b', key: 'y' },
    ];
    expect(ignoredFieldWarnings(ignored).map((w) => [w.code, w.path])).toEqual([
      ['ignored-field', 'layers[0].annotationTypes[0].fields[1]'],
      ['ignored-field', 'layers[1].annotationTypes[2].fields[0]'],
    ]);
    expect(ignoredFieldWarnings([])).toEqual([]);
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
