import {
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { parseSpecText } from '../../src/model';
import { errorOf, ok } from './proposalSupport';
import { connect, type Connection } from './workspace';

// validate_specialization (etapa 4.2): os erros são os da importação da app (`parseSpecText`,
// a mesma função de `src/ui/SpecsDialog.tsx`), com o caminho exato; os avisos são do servidor.

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

interface Validated {
  valid: boolean;
  path?: string;
  errorCount?: number;
  errors: string[];
  issues?: { path: string; message: string }[];
  warnings?: { code: string; path: string; message: string }[];
  spec?: Record<string, unknown>;
  moreErrors?: number;
}

let root: string;
let mcp: Connection;

beforeAll(async () => {
  root = mkdtempSync(join(tmpdir(), 'mapping-spec-'));
  mkdirSync(join(root, 'fontes'), { recursive: true });
  for (const name of ['sdui', 'modelo-de-dados']) {
    copyFileSync(
      join('examples', 'specs', `${name}.json`),
      join(root, 'fontes', `${name}.json`),
    );
  }
  mcp = await connect([root]);
});

afterAll(async () => {
  await mcp?.close();
});

const sdui = (): Json =>
  JSON.parse(readFileSync('examples/specs/sdui.json', 'utf8')) as Json;

/** O SDUI em v3 com uma origem em cada nível (tipo, campo de texto e campo enum). */
function v3(): Json {
  const spec = sdui();
  spec.formatVersion = 3;
  const button = spec.layers[0].annotationTypes[0];
  button.sources = [{ system: 'figma', id: '3f2a9c', name: 'DS/Button' }];
  button.fields[1].sources = [{ system: 'figma', name: 'Label' }];
  button.fields[2].sources = [
    {
      system: 'figma',
      name: 'Style',
      values: { Primary: 'primary', Secondary: 'secondary' },
    },
  ];
  return spec;
}

const text = (spec: Json) => JSON.stringify(spec);

describe('arquivos válidos', () => {
  it('os exemplos do repositório são válidos, com o resumo e sem erros', async () => {
    for (const name of ['sdui', 'modelo-de-dados']) {
      const result = ok(
        await mcp.call<Validated>('validate_specialization', {
          path: `fontes/${name}.json`,
        }),
      );
      expect(result.valid, name).toBe(true);
      expect(result.errors).toEqual([]);
      expect(result.path).toBe(`fontes/${name}.json`);
    }
    const result = ok(
      await mcp.call<Validated>('validate_specialization', { text: text(v3()) }),
    );
    expect(result.spec).toMatchObject({
      id: 'sdui',
      formatVersion: 3,
      typesWithSources: 1,
      fieldsWithSources: 2,
      platforms: ['android', 'ios', 'bff'],
    });
  });

  it('avisa plataforma declarada e não usada e tipo sem code, sem invalidar', async () => {
    const spec = sdui();
    // O `screen` do SDUI já não tem `code`; a plataforma `desktop` não é usada por ninguém.
    spec.platforms.push({ id: 'desktop', name: 'Desktop' });
    const result = ok(
      await mcp.call<Validated>('validate_specialization', { text: text(spec) }),
    );
    expect(result.valid).toBe(true);
    expect(result.warnings).toEqual([
      expect.objectContaining({
        code: 'type-without-code',
        path: 'layers[2].annotationTypes[0]',
      }),
      expect.objectContaining({ code: 'unused-platform', path: 'platforms[3]' }),
    ]);
    expect(result.warnings![1]!.message).toContain('desktop');
  });

  it('o format antigo (mapeador-spec) é aceito, com aviso', async () => {
    const spec = sdui();
    spec.format = 'mapeador-spec';
    const result = ok(
      await mcp.call<Validated>('validate_specialization', { text: text(spec) }),
    );
    expect(result.valid).toBe(true);
    expect(result.warnings).toContainEqual(
      expect.objectContaining({ code: 'legacy-format' }),
    );
  });
});

describe('erros: os mesmos da importação da app, com o caminho exato', () => {
  const BUTTON = 'layers[0].annotationTypes[0]';
  const broken: [string, () => Json][] = [
    [
      'destino de values fora das options',
      () => {
        const spec = v3();
        spec.layers[0].annotationTypes[0].fields[2].sources[0].values.Primary =
          'nao-existe';
        return spec;
      },
    ],
    [
      'values em campo que não é enum',
      () => {
        const spec = v3();
        spec.layers[0].annotationTypes[0].fields[1].sources[0].values = { A: 'b' };
        return spec;
      },
    ],
    [
      'origem sem id nem name',
      () => {
        const spec = v3();
        spec.layers[0].annotationTypes[0].sources = [{ system: 'figma' }];
        return spec;
      },
    ],
    [
      'sources numa especialização v2',
      () => {
        const spec = v3();
        spec.formatVersion = 2;
        return spec;
      },
    ],
    [
      'tipo de campo desconhecido e id repetido',
      () => {
        const spec = sdui();
        spec.layers[0].annotationTypes[0].fields[0].type = 'inexistente';
        spec.layers[0].annotationTypes[1].id = 'button';
        return spec;
      },
    ],
  ];

  for (const [name, make] of broken) {
    it(`${name}`, async () => {
      const content = text(make());
      const expected = parseSpecText(content);
      if (expected.ok) throw new Error('o caso deveria ser inválido');
      expect(expected.errors.length).toBeGreaterThan(0);

      // Por texto.
      const byText = ok(
        await mcp.call<Validated>('validate_specialization', { text: content }),
      );
      expect(byText.valid).toBe(false);
      expect(byText.errors).toEqual(expected.errors);
      expect(byText.issues).toEqual(expected.issues);
      expect(byText.errorCount).toBe(expected.errors.length);
      expect(byText.warnings).toBeUndefined();

      // Por arquivo dentro das raízes: os mesmos erros.
      const file = join(root, 'fontes', 'quebrada.json');
      writeFileSync(file, content);
      const byPath = ok(
        await mcp.call<Validated>('validate_specialization', {
          path: 'fontes/quebrada.json',
        }),
      );
      expect(byPath.errors).toEqual(expected.errors);
      // E por caminho absoluto.
      const absolute = ok(
        await mcp.call<Validated>('validate_specialization', { path: file }),
      );
      expect(absolute.errors).toEqual(expected.errors);
    });
  }

  it('o caminho aponta o trecho exato (ex: sources[0].values.Primary)', async () => {
    const spec = v3();
    spec.layers[0].annotationTypes[0].fields[2].sources[0].values.Primary = 'nao-existe';
    const result = ok(
      await mcp.call<Validated>('validate_specialization', { text: text(spec) }),
    );
    expect(result.issues).toEqual([
      expect.objectContaining({
        path: `${BUTTON}.fields[2].sources[0].values.Primary`,
      }),
    ]);
    expect(result.errors[0]).toContain(`${BUTTON}.fields[2].sources[0].values.Primary: `);
  });

  it('JSON inválido volta como erro, não como falha da tool', async () => {
    const content = '{ "format": ';
    const expected = parseSpecText(content);
    const result = ok(
      await mcp.call<Validated>('validate_specialization', { text: content }),
    );
    expect(result.valid).toBe(false);
    expect(result.errors).toEqual(expected.ok ? [] : expected.errors);
    expect(result.errors[0]).toMatch(/^JSON inválido/);
  });

  it('limita a quantidade de erros devolvidos e diz quantos faltaram', async () => {
    const spec = sdui();
    spec.layers[0].annotationTypes[0].fields = Array.from({ length: 150 }, () => ({
      key: 'x y',
      type: 'string',
    }));
    const expected = parseSpecText(text(spec));
    if (expected.ok) throw new Error('era para falhar');
    expect(expected.errors.length).toBeGreaterThan(100);
    const result = ok(
      await mcp.call<Validated>('validate_specialization', { text: text(spec) }),
    );
    expect(result.errors).toEqual(expected.errors.slice(0, 100));
    expect(result.errorCount).toBe(expected.errors.length);
    expect(result.moreErrors).toBe(expected.errors.length - 100);
  });
});

describe('argumentos e segurança', () => {
  it('exige exatamente um de path ou text', async () => {
    expect(errorOf(await mcp.call('validate_specialization', {})).code).toBe(
      'invalid-arguments',
    );
    expect(
      errorOf(
        await mcp.call('validate_specialization', {
          path: 'fontes/sdui.json',
          text: '{}',
        }),
      ).code,
    ).toBe('invalid-arguments');
  });

  it('recusa caminhos fora das raízes e arquivos inexistentes', async () => {
    expect(
      errorOf(await mcp.call('validate_specialization', { path: '../fora.json' })).code,
    ).toBe('outside-roots');
    expect(
      errorOf(
        await mcp.call('validate_specialization', { path: join(tmpdir(), 'x.json') }),
      ).code,
    ).toBe('outside-roots');
    expect(
      errorOf(await mcp.call('validate_specialization', { path: 'fontes/nada.json' }))
        .code,
    ).toBe('path-not-found');
    expect(
      errorOf(await mcp.call('validate_specialization', { path: 'fontes' })).code,
    ).toBe('not-a-file');
  });
});
