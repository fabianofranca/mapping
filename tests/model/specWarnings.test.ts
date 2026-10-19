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

/** A SDUI de antes do `repo` (formatVersion 2): plataformas com `path` e sem `repo`. */
const LEGACY_SDUI = 'tests/fixtures/sdui-v2.json';

describe('specWarnings', () => {
  it('os exemplos do repositório só têm o aviso do tipo sem code (screen)', () => {
    expect(specWarnings(load('examples/specs/modelo-de-dados.json'))).toEqual([]);
    // O SDUI declara o `repo` das três plataformas: nenhum `path-without-repo`.
    const sdui = specWarnings(load('examples/specs/sdui.json'));
    expect(sdui).toEqual([
      expect.objectContaining({
        code: 'type-without-code',
        path: 'layers[2].annotationTypes[0]',
      }),
    ]);
  });

  it('type-without-code: o texto diz que nenhuma plataforma explica como criar a instância', () => {
    const spec = load('examples/specs/sdui.json');
    const warning = specWarnings(spec).find((w) => w.code === 'type-without-code');
    expect(warning?.message).toBe(
      `o tipo "${spec.layers[2]?.annotationTypes[0]?.id}" não tem \`code\`: nenhuma plataforma diz como criar uma instância dele`,
    );
  });

  describe('path-without-repo', () => {
    const repo = { url: 'https://github.com/acme/android' };
    /** sdui com os `path` de android (e de ios) e a versão 5, com `repo` só onde pedido. */
    const v5 = (repos: Record<string, unknown>) =>
      load(LEGACY_SDUI, (raw) => {
        raw.formatVersion = 5;
        for (const p of raw.platforms)
          if (repos[p.id] !== undefined) p.repo = repos[p.id];
      });
    const only = (spec: Spec) =>
      specWarnings(spec).filter((w) => w.code === 'path-without-repo');

    it('plataforma com tipos com path e sem repo: um aviso por plataforma, na ordem', () => {
      const warnings = only(v5({}));
      expect(warnings.map((w) => w.path)).toEqual(['platforms[0]', 'platforms[1]']);
      expect(warnings[0]?.message).toMatch(
        /^a plataforma "android" tem tipos com `path` \((\d+)\), mas não declara `repo`: o agente não sabe em que repositório estão esses arquivos; declare `repo` \(formatVersion 5\)$/,
      );
    });

    it('com repo, a plataforma não avisa; as outras seguem avisando', () => {
      expect(only(v5({ android: repo })).map((w) => w.path)).toEqual(['platforms[1]']);
      expect(only(v5({ android: repo, ios: repo }))).toEqual([]);
    });

    it('plataforma sem tipos com path não avisa (o bff do exemplo)', () => {
      expect(only(v5({})).some((w) => w.path === 'platforms[2]')).toBe(false);
    });

    it('vale também numa v2 (a mensagem orienta a subir para a 5)', () => {
      const spec = load(LEGACY_SDUI);
      expect(spec.formatVersion).toBe(2);
      expect(only(spec).length).toBeGreaterThan(0);
    });

    it('vem depois dos avisos de tipo e de unused-platform', () => {
      const spec = load(LEGACY_SDUI, (raw) => {
        raw.platforms.push({ id: 'web', name: 'Web' });
      });
      expect(specWarnings(spec).map((w) => w.code)).toEqual([
        'type-without-code',
        'unused-platform',
        'path-without-repo',
        'path-without-repo',
      ]);
    });
  });

  it('plataforma declarada e não usada em code', () => {
    const spec = load(LEGACY_SDUI, (raw) => {
      raw.platforms.push({ id: 'web', name: 'Web' });
    });
    const unused = specWarnings(spec).filter((w) => w.code === 'unused-platform');
    expect(unused).toEqual([expect.objectContaining({ path: 'platforms[3]' })]);
  });

  it('campo do tipo removido (codeRef): aviso com o caminho, logo depois do formato antigo', () => {
    const parsed = parse(LEGACY_SDUI, (raw) => {
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
      ['path-without-repo', 'platforms[0]'],
      ['path-without-repo', 'platforms[1]'],
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
