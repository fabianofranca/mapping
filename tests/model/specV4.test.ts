import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import {
  SPEC_FORMAT_VERSIONS,
  findTypesBySource,
  formatSpecPath,
  isExecutableSystem,
  isPackagePath,
  parseSpec,
  parseSpecPath,
  type Spec,
  type SpecIssue,
} from '../../src/model';

// Especialização formatVersion 4 (etapa Biblioteca): `fonts`, `origins`, `migrations`, e nos
// tipos `component`, `doc`, `examples`, `slot`/`ignore`; nos campos `path`. As `migrations`
// têm o arquivo próprio (specMigrations.test.ts). v1 a v3 seguem como estavam.

const read = (path: string): string => readFileSync(path, 'utf8');
const biblioteca = read('tests/fixtures/specs/biblioteca.json');
const jsonSchema = JSON.parse(read('docs/spec.schema.json')) as Record<string, unknown>;
const jsonValidator = z.fromJSONSchema(jsonSchema as never);

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

const BUTTON = 'layers[0].annotationTypes[0]';
const BADGE = 'layers[0].annotationTypes[1]';
const VERSION_4 = 'only allowed with formatVersion 4';
const NOT_EXECUTABLE = 'only allowed in a system declared in origins';

/** O exemplo da biblioteca (v4), para o teste alterar. */
function v4(): Json {
  return JSON.parse(biblioteca) as Json;
}

function issuesOf(spec: Json): SpecIssue[] {
  const result = parseSpec(spec);
  if (result.ok) throw new Error('era para falhar');
  return result.issues;
}

function parsed(spec: Json): Spec {
  const result = parseSpec(spec);
  if (!result.ok) throw new Error(result.errors.join('\n'));
  return result.spec;
}

/** O caminho exato e a mensagem exata estão entre os erros. */
function expectIssue(spec: Json, path: string, message: string): void {
  expect(issuesOf(spec)).toContainEqual(expect.objectContaining({ path, message }));
}

/** O caminho exato está entre os erros e a mensagem dele começa com o texto. */
function expectIssueStarting(spec: Json, path: string, start: string): void {
  const issues = issuesOf(spec);
  expect(
    issues.some((i) => i.path === path && i.message.startsWith(start)),
    JSON.stringify(issues),
  ).toBe(true);
}

describe('o exemplo da biblioteca (formatVersion 4)', () => {
  it('as versões aceitas vão de 1 a 16', () => {
    expect(SPEC_FORMAT_VERSIONS).toEqual([
      1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16,
    ]);
  });

  it('valida no zod e no JSON Schema, sem erros nem avisos escondidos', () => {
    const result = parseSpec(v4());
    expect(result.ok).toBe(true);
    expect(jsonValidator.safeParse(v4()).success).toBe(true);
  });

  it('o JSON Schema aceita origins[].screen.direction literal ltr/rtl e recusa outro valor', () => {
    for (const direction of ['ltr', 'rtl']) {
      const spec = v4();
      spec.origins[0].screen.direction = direction;
      expect(jsonValidator.safeParse(spec).success, direction).toBe(true);
      expect(parseSpec(spec).ok, direction).toBe(true);
    }
    const bad = v4();
    bad.origins[0].screen.direction = 'up';
    expect(jsonValidator.safeParse(bad).success).toBe(false);
  });

  it('lê as chaves novas e elas sobrevivem à leitura', () => {
    const spec = parsed(v4());
    expect(spec.formatVersion).toBe(4);
    const button = spec.layers[0]?.annotationTypes[0];
    expect(button?.component).toBe('components/button.json');
    expect(button?.doc).toBe('docs/button.md');
    expect(button?.examples?.map((e) => e.name)).toEqual(['Primário', 'Texto']);
    expect(button?.sources).toEqual([
      { system: 'sdui', name: 'Button', ignore: ['analytics'] },
    ]);
    expect(spec.fonts).toEqual([
      { family: 'Roboto', file: 'fonts/Roboto-Regular.ttf', weight: 400 },
    ]);
    expect(spec.origins?.[0]?.system).toBe('sdui');
    expect(spec.origins?.[0]?.examples).toEqual([
      { name: 'Configurações', file: 'examples/settings.sdui.json' },
    ]);
    expect(spec.migrations?.[0]).toMatchObject({ from: 1, to: 2 });
  });

  it('o campo removido (codeRef) continua sendo lido e ignorado, sem perder as chaves novas', () => {
    const raw = v4();
    raw.layers[0].annotationTypes[0].fields.push({ key: 'ref', type: 'codeRef' });
    const result = parseSpec(raw);
    if (!result.ok) throw new Error(result.errors.join('\n'));
    expect(result.ignored).toEqual([
      { path: `${BUTTON}.fields[2]`, typeId: 'button', key: 'ref' },
    ]);
    const button = result.spec.layers[0]?.annotationTypes[0];
    expect(button?.fields.map((f) => f.key)).toEqual(['label', 'style']);
    expect(button?.component).toBe('components/button.json');
    expect(button?.doc).toBe('docs/button.md');
    expect(button?.examples).toHaveLength(2);
    expect(result.spec.fonts).toHaveLength(1);
    expect(result.spec.origins).toHaveLength(1);
    expect(result.spec.migrations).toHaveLength(1);
  });

  it('exemplo de valores que cita o campo removido é erro (o campo não existe mais)', () => {
    const raw = v4();
    raw.layers[0].annotationTypes[0].fields.push({ key: 'ref', type: 'codeRef' });
    raw.layers[0].annotationTypes[0].examples[0].values.ref = 'x';
    expectIssue(
      raw,
      `${BUTTON}.examples[0].values.ref`,
      '"ref" is not a field of the type',
    );
  });
});

describe('isPackagePath', () => {
  it.each([
    ['components/button.json', '.json', true],
    ['button.json', '.json', true],
    ['docs/a/b.md', '.md', true],
    ['fonts/Roboto.woff2', ['.ttf', '.woff2'], true],
    ['../button.json', '.json', false],
    ['components/../button.json', '.json', false],
    ['./button.json', '.json', false],
    ['/button.json', '.json', false],
    ['C:/button.json', '.json', false],
    ['components//button.json', '.json', false],
    ['components\\button.json', '.json', false],
    ['components/button.txt', '.json', false],
    ['components/button.JSON', '.json', false],
    ['components/.json', '.json', false],
    ['components/', '.json', false],
    ['', '.json', false],
    ['fonts/Roboto.otf', ['.ttf', '.woff2'], false],
  ] as const)('%s com %j → %s', (path, ext, expected) => {
    expect(isPackagePath(path, ext)).toBe(expected);
  });
});

describe('parseSpecPath', () => {
  it.each([
    ['origins', ['origins']],
    ['origins[0].screen.roots[1].path', ['origins', 0, 'screen', 'roots', 1, 'path']],
    ['origins[12].examples[3]', ['origins', 12, 'examples', 3]],
    ['', []],
  ] as const)('%s', (text, keys) => {
    expect(parseSpecPath(text)).toEqual(keys);
  });

  it('é o inverso de formatSpecPath', () => {
    const keys = ['layers', 1, 'annotationTypes', 0, 'fields', 2, 'sources', 0, 'path'];
    expect(parseSpecPath(formatSpecPath(keys))).toEqual(keys);
  });
});

describe('fonts', () => {
  it('aceita família, arquivo, peso inteiro ou faixa, e estilo', () => {
    for (const font of [
      { family: 'Roboto', file: 'fonts/R.ttf' },
      { family: 'Roboto', file: 'fonts/R.otf', weight: 100 },
      { family: 'Roboto', file: 'fonts/R.woff', weight: 1000, style: 'italic' },
      { family: 'Roboto', file: 'fonts/R.woff2', weight: '100 900', style: 'normal' },
    ]) {
      const spec = v4();
      spec.fonts = [font];
      expect(parseSpec(spec).ok, JSON.stringify(font)).toBe(true);
      expect(jsonValidator.safeParse(spec).success, JSON.stringify(font)).toBe(true);
    }
  });

  it('a mesma família com pesos ou estilos diferentes não é repetição', () => {
    const spec = v4();
    spec.fonts = [
      { family: 'Roboto', file: 'fonts/R4.ttf', weight: 400 },
      { family: 'Roboto', file: 'fonts/R7.ttf', weight: 700 },
      { family: 'Roboto', file: 'fonts/R4i.ttf', weight: 400, style: 'italic' },
      { family: 'Roboto', file: 'fonts/Rv.ttf', weight: '100 900' },
      { family: 'Outra', file: 'fonts/O.ttf', weight: 400 },
    ];
    expect(parseSpec(spec).ok).toBe(true);
  });

  it('família vazia', () => {
    const spec = v4();
    spec.fonts[0].family = '';
    expectIssue(spec, 'fonts[0].family', 'cannot be empty');
  });

  it.each([
    ['fonts/R.txt', 'invalid extension: expected .ttf, .otf, .woff, .woff2'],
    ['fonts/R.TTF', 'invalid extension: expected .ttf, .otf, .woff, .woff2'],
  ])('arquivo %s', (file, message) => {
    const spec = v4();
    spec.fonts[0].file = file;
    expectIssue(spec, 'fonts[0].file', message);
  });

  it.each(['../R.ttf', '/R.ttf', 'fonts/../R.ttf', 'C:/R.ttf', ''])(
    'arquivo %j fora do pacote',
    (file) => {
      const spec = v4();
      spec.fonts[0].file = file;
      expectIssueStarting(spec, 'fonts[0].file', 'invalid path: use a path relative');
      expect(jsonValidator.safeParse(spec).success).toBe(false);
    },
  );

  it.each([
    50,
    1001,
    400.5,
    '900 100',
    '400 400',
    '100',
    'abc',
    '100  900',
    '50 900',
    true,
  ])('peso %j', (weight) => {
    const spec = v4();
    spec.fonts[0].weight = weight;
    expectIssueStarting(
      spec,
      'fonts[0].weight',
      'invalid weight; use an integer from 100 to 1000',
    );
  });

  it('estilo fora de normal e italic', () => {
    const spec = v4();
    spec.fonts[0].style = 'oblique';
    expectIssue(spec, 'fonts[0].style', 'invalid style; use "normal" or "italic"');
    expect(jsonValidator.safeParse(spec).success).toBe(false);
  });

  it('par família + peso + estilo repetido', () => {
    const spec = v4();
    spec.fonts.push({ family: 'Roboto', file: 'fonts/Outra.ttf', weight: 400 });
    expectIssue(spec, 'fonts[1]', 'font "Roboto" (weight 400, normal) repeated');
  });

  it('o estilo padrão conta como normal na repetição, e sem peso é um caso à parte', () => {
    const spec = v4();
    spec.fonts = [
      { family: 'Roboto', file: 'fonts/A.ttf' },
      { family: 'Roboto', file: 'fonts/B.ttf', style: 'normal' },
    ];
    expectIssue(spec, 'fonts[1]', 'font "Roboto" (no weight, normal) repeated');
  });

  it('chave desconhecida na fonte', () => {
    const spec = v4();
    spec.fonts[0].extra = 1;
    expectIssue(spec, 'fonts[0]', 'Unrecognized key: "extra"');
    expect(jsonValidator.safeParse(spec).success).toBe(false);
  });
});

describe('component e doc', () => {
  it('aceita caminhos do pacote', () => {
    const spec = v4();
    spec.layers[0].annotationTypes[1].component = 'components/sub/badge.json';
    spec.layers[0].annotationTypes[1].doc = 'badge.md';
    expect(parseSpec(spec).ok).toBe(true);
    expect(jsonValidator.safeParse(spec).success).toBe(true);
  });

  it.each([
    ['component', '../button.json'],
    ['component', '/button.json'],
    ['component', 'components/../button.json'],
    ['doc', '../button.md'],
    ['doc', '/button.md'],
  ])('%s com %s sai do pacote', (key, value) => {
    const spec = v4();
    spec.layers[0].annotationTypes[0][key] = value;
    expectIssueStarting(spec, `${BUTTON}.${key}`, 'invalid path: use a path relative');
    expect(jsonValidator.safeParse(spec).success).toBe(false);
  });

  it.each([
    ['component', 'components/button.md', 'invalid extension: expected .json'],
    ['component', 'components/button', 'invalid extension: expected .json'],
    ['doc', 'docs/button.json', 'invalid extension: expected .md'],
    ['doc', 'docs/button.txt', 'invalid extension: expected .md'],
  ])('%s com %s tem a extensão errada', (key, value, message) => {
    const spec = v4();
    spec.layers[0].annotationTypes[0][key] = value;
    expectIssue(spec, `${BUTTON}.${key}`, message);
    expect(jsonValidator.safeParse(spec).success).toBe(false);
  });

  it('vazio', () => {
    const spec = v4();
    spec.layers[0].annotationTypes[0].component = '';
    expectIssueStarting(spec, `${BUTTON}.component`, 'invalid path');
  });
});

describe('examples do tipo', () => {
  /** O Badge com um campo de cada tipo para exemplos de valores. */
  function withFields(): Json {
    const spec = v4();
    spec.layers[0].annotationTypes[1].fields.push(
      { key: 'when', type: 'date' },
      { key: 'size', type: 'enum', options: ['s', 'm'] },
      {
        key: 'rows',
        type: 'table',
        columns: [
          { key: 'col', type: 'string' },
          { key: 'num', type: 'number' },
          { key: 'kind', type: 'enum', options: ['a', 'b'] },
          { key: 'day', type: 'date' },
        ],
      },
      { key: 'link', type: 'ref', accepts: { free: true } },
    );
    return spec;
  }

  it('valores válidos de cada tipo de campo, e null sempre', () => {
    const spec = withFields();
    spec.layers[0].annotationTypes[1].examples = [
      {
        name: 'Completo',
        values: { text: 'Novo', count: 3, when: '2026-02-28', size: 'm' },
      },
      {
        name: 'Vazio',
        values: {
          text: null,
          count: null,
          when: null,
          size: null,
          rows: null,
          link: null,
        },
      },
    ];
    expect(parseSpec(spec).ok).toBe(true);
    expect(jsonValidator.safeParse(spec).success).toBe(true);
  });

  it('valores vazios {} também são um exemplo (o tipo com os padrões)', () => {
    const spec = v4();
    spec.layers[0].annotationTypes[0].examples.push({ name: 'Padrão', values: {} });
    expect(parseSpec(spec).ok).toBe(true);
  });

  it('descrição só vale como texto', () => {
    const spec = v4();
    spec.layers[0].annotationTypes[0].examples[0].description = 5;
    expect(parseSpec(spec).ok).toBe(false);
    expect(jsonValidator.safeParse(spec).success).toBe(false);
  });

  it('nome repetido no tipo (e o mesmo nome em outro tipo vale)', () => {
    const spec = v4();
    spec.layers[0].annotationTypes[1].examples = [{ name: 'Primário', values: {} }];
    expect(parseSpec(spec).ok).toBe(true);
    spec.layers[0].annotationTypes[0].examples[1].name = 'Primário';
    expectIssue(spec, `${BUTTON}.examples[1].name`, 'name "Primário" repeated');
  });

  it('nome vazio', () => {
    const spec = v4();
    spec.layers[0].annotationTypes[0].examples[0].name = '';
    expectIssue(spec, `${BUTTON}.examples[0].name`, 'cannot be empty');
  });

  it('chave que não é campo do tipo (coluna não vale)', () => {
    const spec = withFields();
    spec.layers[0].annotationTypes[1].examples = [
      { name: 'A', values: { nada: 'x', col: 'y' } },
    ];
    expectIssue(
      spec,
      `${BADGE}.examples[0].values.nada`,
      '"nada" is not a field of the type',
    );
    expectIssue(
      spec,
      `${BADGE}.examples[0].values.col`,
      '"col" is not a field of the type',
    );
  });

  it.each([
    ['text', 5, 'must be text'],
    ['count', 'três', 'the value must be a number'],
    ['when', '2026-02-30', 'must be a valid date YYYY-MM-DD'],
    ['when', 'ontem', 'must be a valid date YYYY-MM-DD'],
    ['when', 20260228, 'must be a valid date YYYY-MM-DD'],
    ['size', 'g', 'must be one of the options'],
    ['size', 1, 'must be one of the options'],
  ])('valor incompatível em %s: %j', (key, value, message) => {
    const spec = withFields();
    spec.layers[0].annotationTypes[1].examples = [
      { name: 'A', values: { [key]: value } },
    ];
    expectIssue(spec, `${BADGE}.examples[0].values.${key}`, message);
  });

  it('valor que não é texto, número nem null', () => {
    const spec = withFields();
    spec.layers[0].annotationTypes[1].examples = [{ name: 'A', values: { text: true } }];
    expectIssue(
      spec,
      `${BADGE}.examples[0].values.text`,
      'must be text, a number or null (or a list of rows, in a table field)',
    );
    expect(jsonValidator.safeParse(spec).success).toBe(false);
  });

  it('campo ref não aceita valor em exemplo, nem texto', () => {
    const spec = withFields();
    spec.layers[0].annotationTypes[1].examples = [{ name: 'A', values: { link: 'x' } }];
    expectIssue(
      spec,
      `${BADGE}.examples[0].values.link`,
      'a "ref" field takes no value in an example',
    );
  });

  describe('campo table: a lista de linhas (decisão 24 da #897)', () => {
    const ROWS = `${BADGE}.examples[0].values.rows`;
    const withRows = (rows: unknown, mutate?: (spec: Json) => void): Json => {
      const spec = withFields();
      mutate?.(spec);
      spec.layers[0].annotationTypes[1].examples = [{ name: 'A', values: { rows } }];
      return spec;
    };

    it('duas linhas válidas (texto, número, enum, data e null) passam', () => {
      const spec = withRows([
        { col: 'Início', num: 3, kind: 'a', day: '2026-02-28' },
        { col: null, num: null, kind: null, day: null },
        {},
      ]);
      expect(parseSpec(spec).ok).toBe(true);
      expect(jsonValidator.safeParse(spec).success).toBe(true);
    });

    it('a lista vazia vale', () => {
      const spec = withRows([]);
      expect(parseSpec(spec).ok).toBe(true);
      expect(jsonValidator.safeParse(spec).success).toBe(true);
    });

    it('a formatVersion não mudou', () => {
      const spec = withRows([{ col: 'x' }]);
      expect(spec.formatVersion).toBe(4);
      expect(parsed(spec).formatVersion).toBe(4);
    });

    it.each([
      ['num', 'abc', 'the value must be a number'],
      ['kind', 'z', 'must be one of the options'],
      ['day', '2026-02-30', 'must be a valid date YYYY-MM-DD'],
      ['col', 5, 'must be text'],
    ])('célula fora do tipo da coluna %s: %j', (column, value, message) => {
      const spec = withRows([{ col: 'ok' }, { [column]: value }]);
      expectIssue(spec, `${ROWS}[1].${column}`, message);
    });

    it('chave que não é coluna, inclusive _id', () => {
      const spec = withRows([{ col: 'ok' }, { nada: 'x', _id: 'r1' }]);
      expectIssue(spec, `${ROWS}[1].nada`, '"nada" is not a column of "rows"');
      expectIssue(spec, `${ROWS}[1]._id`, '"_id" is not a column of "rows"');
    });

    it('linha que não é objeto', () => {
      for (const row of ['x', 3, null, ['a']]) {
        expectIssue(withRows([row]), `${ROWS}[0]`, 'must be an object (column → value)');
      }
    });

    it('coluna ref só aceita null no exemplo (formatVersion 7 ou mais)', () => {
      const addRef = (spec: Json) => {
        spec.formatVersion = 7;
        spec.layers[0].annotationTypes[1].fields
          .find((f: Json) => f.key === 'rows')
          .columns.push({ key: 'to', type: 'ref', accepts: { free: true } });
      };
      expect(parseSpec(withRows([{ to: null }], addRef)).ok).toBe(true);
      expectIssue(
        withRows([{ col: 'a' }, { to: 'alvo' }], addRef),
        `${ROWS}[1].to`,
        'a "ref" column takes no value in an example',
      );
    });

    it.each([['x'], [5]])('texto ou número no campo table: %j', (value) => {
      expectIssue(withRows(value), ROWS, 'a "table" field takes only the list of rows');
    });

    it('null no campo table vale', () => {
      expect(parseSpec(withRows(null)).ok).toBe(true);
    });

    it('lista de linhas em campo que não é table não vale', () => {
      const spec = withFields();
      spec.layers[0].annotationTypes[1].examples = [
        { name: 'A', values: { text: [{ col: 'x' }] } },
      ];
      expect(parseSpec(spec).ok).toBe(false);
    });

    it('o JSON Schema recusa célula composta e lista em campo não-table só pelo formato', () => {
      const spec = withRows([{ col: { a: 1 } }]);
      expect(jsonValidator.safeParse(spec).success).toBe(false);
      expect(parseSpec(spec).ok).toBe(false);
    });

    it('as mensagens novas levam código e parâmetros no modelo', () => {
      const issues = issuesOf(withRows([{ nada: 1 }, 'x']));
      expect(issues).toContainEqual({
        path: `${ROWS}[0].nada`,
        message: '"nada" is not a column of "rows"',
        code: 'spec.exampleNotColumn',
        params: { key: 'nada', field: 'rows' },
      });
      expect(issues).toContainEqual({
        path: `${ROWS}[1]`,
        message: 'must be an object (column → value)',
        code: 'spec.exampleRowNotObject',
      });
      expect(issuesOf(withRows('x'))).toContainEqual({
        path: ROWS,
        message: 'a "table" field takes only the list of rows',
        code: 'spec.exampleTableNeedsRows',
      });
    });
  });

  describe('exemplo de um sistema externo (system + file)', () => {
    it('aceita um sistema declarado em origins e um arquivo .json do pacote', () => {
      const spec = v4();
      spec.layers[0].annotationTypes[0].examples.push({
        name: 'Do servidor',
        description: 'O nó como o BFF devolve.',
        system: 'sdui',
        file: 'examples/button.sdui.json',
      });
      expect(parseSpec(spec).ok).toBe(true);
      expect(jsonValidator.safeParse(spec).success).toBe(true);
    });

    it('sistema fora de origins', () => {
      const spec = v4();
      spec.layers[0].annotationTypes[0].examples.push({
        name: 'X',
        system: 'figma',
        file: 'examples/x.json',
      });
      expectIssue(
        spec,
        `${BUTTON}.examples[2].system`,
        'system "figma" is not declared in origins',
      );
    });

    it('sem origins nenhum sistema está declarado', () => {
      const spec = v4();
      delete spec.origins;
      spec.layers[0].annotationTypes[0].sources = [{ system: 'sdui', name: 'Button' }];
      spec.layers[0].annotationTypes[0].fields[1].sources[0] = {
        system: 'sdui',
        name: 'variant',
      };
      spec.layers[0].annotationTypes[0].examples.push({
        name: 'X',
        system: 'sdui',
        file: 'examples/x.json',
      });
      expectIssue(
        spec,
        `${BUTTON}.examples[2].system`,
        'system "sdui" is not declared in origins',
      );
    });

    it('arquivo que não é .json do pacote', () => {
      const spec = v4();
      spec.layers[0].annotationTypes[0].examples.push({
        name: 'X',
        system: 'sdui',
        file: 'examples/x.md',
      });
      expectIssue(
        spec,
        `${BUTTON}.examples[2].file`,
        'invalid extension: expected .json',
      );
      spec.layers[0].annotationTypes[0].examples[2].file = '../x.json';
      expectIssueStarting(spec, `${BUTTON}.examples[2].file`, 'invalid path');
    });

    it('system sem file e file sem system', () => {
      const spec = v4();
      spec.layers[0].annotationTypes[0].examples.push(
        { name: 'S', system: 'sdui' },
        { name: 'F', file: 'examples/x.json' },
      );
      expectIssue(spec, `${BUTTON}.examples[2].file`, 'required with "system"');
      expectIssue(spec, `${BUTTON}.examples[3].system`, 'required with "file"');
      expect(jsonValidator.safeParse(spec).success).toBe(false);
    });
  });

  describe('os dois modos', () => {
    it('juntos é erro, com o caminho do exemplo', () => {
      const spec = v4();
      spec.layers[0].annotationTypes[0].examples[0].system = 'sdui';
      spec.layers[0].annotationTypes[0].examples[0].file = 'examples/x.json';
      expectIssue(
        spec,
        `${BUTTON}.examples[0]`,
        'use "values" or "system" with "file", not both modes together',
      );
      expect(jsonValidator.safeParse(spec).success).toBe(false);
    });

    it('values junto só com system também é erro', () => {
      const spec = v4();
      spec.layers[0].annotationTypes[0].examples[0].system = 'sdui';
      expectIssue(
        spec,
        `${BUTTON}.examples[0]`,
        'use "values" or "system" with "file", not both modes together',
      );
    });

    it('nenhum dos dois é erro', () => {
      const spec = v4();
      delete spec.layers[0].annotationTypes[0].examples[0].values;
      expectIssue(
        spec,
        `${BUTTON}.examples[0]`,
        'needs "values" or "system" with "file"',
      );
      expect(jsonValidator.safeParse(spec).success).toBe(false);
    });
  });
});

describe('sources do tipo: slot e ignore', () => {
  it('aceitos em sistema declarado em origins', () => {
    const spec = v4();
    spec.layers[0].annotationTypes[0].sources[0].slot = 'content';
    const source = parsed(spec).layers[0]?.annotationTypes[0]?.sources?.[0];
    expect(source).toEqual({
      system: 'sdui',
      name: 'Button',
      slot: 'content',
      ignore: ['analytics'],
    });
    expect(jsonValidator.safeParse(spec).success).toBe(true);
  });

  it('em sistema que não está em origins são recusados, cada um no seu caminho', () => {
    const spec = v4();
    spec.layers[0].annotationTypes[1].sources = [
      { system: 'figma', name: 'Badge', slot: 'content', ignore: ['a'] },
    ];
    expectIssue(spec, `${BADGE}.sources[0].slot`, NOT_EXECUTABLE);
    expectIssue(spec, `${BADGE}.sources[0].ignore`, NOT_EXECUTABLE);
  });

  it('um sistema fora de origins sem slot nem ignore segue como na v3', () => {
    const spec = v4();
    spec.layers[0].annotationTypes[1].sources = [{ system: 'figma', name: 'Badge' }];
    expect(parseSpec(spec).ok).toBe(true);
  });

  it('slot vazio e ignore com texto vazio', () => {
    const spec = v4();
    spec.layers[0].annotationTypes[0].sources[0].slot = '';
    spec.layers[0].annotationTypes[0].sources[0].ignore = ['a', ''];
    expectIssue(spec, `${BUTTON}.sources[0].slot`, 'cannot be empty');
    expectIssue(spec, `${BUTTON}.sources[0].ignore[1]`, 'cannot be empty');
    expect(jsonValidator.safeParse(spec).success).toBe(false);
  });

  it('ignore com repetição', () => {
    const spec = v4();
    spec.layers[0].annotationTypes[0].sources[0].ignore = ['analytics', 'x', 'analytics'];
    expectIssue(spec, `${BUTTON}.sources[0].ignore[2]`, '"analytics" repeated');
    expect(jsonValidator.safeParse(spec).success).toBe(false);
  });

  it('chave desconhecida continua sendo erro', () => {
    const spec = v4();
    spec.layers[0].annotationTypes[0].sources[0].extra = 1;
    expectIssue(spec, `${BUTTON}.sources[0]`, 'Unrecognized key: "extra"');
  });
});

describe('sources de campo e de coluna: path e name', () => {
  const STYLE = `${BUTTON}.fields[1].sources[0]`;

  /** O Badge com uma tabela cuja coluna tem `sources`. */
  function withColumn(source: Json): Json {
    const spec = v4();
    spec.layers[0].annotationTypes[1].fields.push({
      key: 'rows',
      type: 'table',
      columns: [{ key: 'col', type: 'string', sources: [source] }],
    });
    return spec;
  }

  it('em sistema executável o path basta e o name é opcional', () => {
    const spec = v4();
    delete spec.layers[0].annotationTypes[0].fields[1].sources[0].name;
    expect(parsed(spec).layers[0]?.annotationTypes[0]?.fields[1]?.sources).toEqual([
      {
        system: 'sdui',
        path: 'variant',
        values: { filled: 'primary', plain: 'text' },
      },
    ]);
    expect(jsonValidator.safeParse(spec).success).toBe(true);
  });

  it.each(['a', 'props.variant', 'a.b[0].c', 'a[10]', 'item_1.x-y'])(
    'path com sintaxe válida: %s',
    (path) => {
      const spec = v4();
      spec.layers[0].annotationTypes[0].fields[1].sources[0].path = path;
      expect(parseSpec(spec).ok).toBe(true);
    },
  );

  it('em sistema executável o path é required, mesmo com name', () => {
    const spec = v4();
    delete spec.layers[0].annotationTypes[0].fields[1].sources[0].path;
    expectIssue(spec, `${STYLE}.path`, 'required in a system declared in origins');
    expect(jsonValidator.safeParse(spec).success).toBe(true);
  });

  it('em sistema fora de origins o name continua required e o path é proibido', () => {
    const spec = v4();
    spec.layers[0].annotationTypes[0].fields[1].sources = [
      { system: 'figma', name: 'Style' },
    ];
    expect(parseSpec(spec).ok).toBe(true);

    spec.layers[0].annotationTypes[0].fields[1].sources = [
      { system: 'figma', path: 'style' },
    ];
    expectIssue(spec, `${STYLE}.path`, NOT_EXECUTABLE);
    expectIssue(spec, `${STYLE}.name`, 'required in a system that is not in origins');
    expect(jsonValidator.safeParse(spec).success).toBe(true);

    spec.layers[0].annotationTypes[0].fields[1].sources = [{ system: 'figma' }];
    expectIssue(spec, `${STYLE}.name`, 'required in a system that is not in origins');
    expect(jsonValidator.safeParse(spec).success).toBe(false);
  });

  it.each([
    ['a..b', 'invalid path "a..b" (empty segment)'],
    ['', 'cannot be empty'],
    ['a[', 'invalid path "a[" (missing "]")'],
    ['a[x]', 'invalid path "a[x]" (invalid index: [x])'],
    ['.a', 'invalid path ".a" (empty segment)'],
    ['a]', 'invalid path "a]" (unexpected character: ])'],
    [
      'a[*].b',
      'invalid path "a[*].b" ("[*]" is only valid in roots[].path of an origin)',
    ],
  ])('path %j', (path, message) => {
    const spec = v4();
    spec.layers[0].annotationTypes[0].fields[1].sources[0].path = path;
    expectIssue(spec, `${STYLE}.path`, message);
  });

  it('coluna de table: executável pede path, fora de origins pede name', () => {
    expect(parseSpec(withColumn({ system: 'sdui', path: 'rows[0]' })).ok).toBe(true);
    expect(parseSpec(withColumn({ system: 'figma', name: 'Linha' })).ok).toBe(true);
    const column = `${BADGE}.fields[2].columns[0].sources[0]`;
    expectIssue(
      withColumn({ system: 'sdui', name: 'Linha' }),
      `${column}.path`,
      'required in a system declared in origins',
    );
    expectIssue(
      withColumn({ system: 'figma', path: 'rows' }),
      `${column}.path`,
      NOT_EXECUTABLE,
    );
    expectIssue(
      withColumn({ system: 'figma', path: 'rows' }),
      `${column}.name`,
      'required in a system that is not in origins',
    );
    expectIssue(
      withColumn({ system: 'sdui', path: 'a[*]' }),
      `${column}.path`,
      'invalid path "a[*]" ("[*]" is only valid in roots[].path of an origin)',
    );
  });

  it('as conferências de values que já existiam continuam valendo com path', () => {
    const spec = v4();
    spec.layers[0].annotationTypes[0].fields[1].sources[0].values.filled = 'main';
    expectIssue(spec, `${STYLE}.values.filled`, '"main" is not in the options');
    const text = v4();
    text.layers[0].annotationTypes[0].fields[0].sources = [
      { system: 'sdui', path: 'label', values: { A: 'a' } },
    ];
    expectIssue(
      text,
      `${BUTTON}.fields[0].sources[0].values`,
      'only allowed in enum fields',
    );
  });
});

describe('origins', () => {
  it('a leitura devolve as origens como o parseOrigins as entende', () => {
    const origin = parsed(v4()).origins?.[0];
    expect(origin).toMatchObject({
      system: 'sdui',
      name: 'SDUI',
      node: { type: 'type', props: 'props', children: 'children' },
    });
    expect(origin?.screen?.roots).toEqual([{ path: 'content' }]);
  });

  it('um problema do parseOrigins chega como issue do zod no caminho exato', () => {
    const spec = v4();
    spec.origins[0].screen.roots.push({ path: 'a[', color: 'x' });
    const issues = issuesOf(spec);
    expect(issues).toContainEqual(
      expect.objectContaining({
        path: 'origins[0].screen.roots[1].path',
        message: 'invalid path "a[" (missing "]")',
      }),
    );
    expect(issues).toContainEqual(
      expect.objectContaining({
        path: 'origins[0].screen.roots[1].color',
        message: 'unknown key: color',
      }),
    );
  });

  it.each([
    [
      'sem o node',
      (o: Json) => delete o.node,
      'origins[0].node',
      'expected an object with type, props and children',
    ],
    ['sem o screen', (o: Json) => delete o.screen, 'origins[0].screen', 'required'],
    [
      'sem a largura',
      (o: Json) => delete o.screen.width,
      'origins[0].screen.width',
      'required',
    ],
    [
      'chave desconhecida',
      (o: Json) => (o.extra = 1),
      'origins[0].extra',
      'unknown key: extra',
    ],
    [
      '[*] fora de roots',
      (o: Json) => (o.screen.width = { path: 'a[*]' }),
      'origins[0].screen.width.path',
      '"[*]" is only valid in roots[].path',
    ],
  ])('%s', (_name, mutate, path, message) => {
    const spec = v4();
    mutate(spec.origins[0]);
    expectIssue(spec, path, message);
  });

  it('origens com o mesmo system', () => {
    const spec = v4();
    spec.origins.push(structuredClone(spec.origins[0]));
    expectIssue(spec, 'origins[1].system', 'repeated origin: sdui');
  });

  it('origins que não é uma lista', () => {
    const spec = v4();
    spec.origins = { system: 'sdui' };
    expectIssue(spec, 'origins', 'expected a list');
  });

  it('origins vazia é válida (nenhum sistema executável)', () => {
    const spec = v4();
    spec.origins = [];
    spec.layers[0].annotationTypes[0].sources = [{ system: 'sdui', name: 'Button' }];
    spec.layers[0].annotationTypes[0].fields[1].sources[0] = {
      system: 'sdui',
      name: 'x',
    };
    expect(parseSpec(spec).ok).toBe(true);
  });

  it('uma origem com problema ainda conta como declarada: sem erros em cascata', () => {
    const spec = v4();
    delete spec.origins[0].node;
    const issues = issuesOf(spec);
    expect(issues.map((i) => i.path)).toEqual(['origins[0].node']);
  });

  describe('examples da origem', () => {
    it('aceita nome único e arquivo .json do pacote', () => {
      const spec = v4();
      spec.origins[0].examples.push({ name: 'Outra', file: 'examples/outra.json' });
      expect(parsed(spec).origins?.[0]?.examples).toHaveLength(2);
    });

    it('nome repetido', () => {
      const spec = v4();
      spec.origins[0].examples.push({ name: 'Configurações', file: 'examples/b.json' });
      expectIssue(spec, 'origins[0].examples[1].name', 'name "Configurações" repeated');
    });

    it('nome vazio', () => {
      const spec = v4();
      spec.origins[0].examples[0].name = '';
      expectIssue(spec, 'origins[0].examples[0].name', 'expected non-empty text');
    });

    it.each([
      ['examples/a.md', 'invalid extension: expected .json'],
      ['../a.json', 'invalid path: use a path relative'],
      ['/a.json', 'invalid path: use a path relative'],
    ])('arquivo %s', (file, start) => {
      const spec = v4();
      spec.origins[0].examples[0].file = file;
      expectIssueStarting(spec, 'origins[0].examples[0].file', start);
    });

    it('arquivo ausente, chave desconhecida e lista inválida', () => {
      const spec = v4();
      delete spec.origins[0].examples[0].file;
      spec.origins[0].examples[0].extra = 1;
      expectIssue(
        spec,
        'origins[0].examples[0].file',
        'expected the path of a .json file in the package',
      );
      expectIssue(spec, 'origins[0].examples[0].extra', 'unknown key: extra');
      spec.origins[0].examples = 'x';
      expectIssue(spec, 'origins[0].examples', 'expected a list');
    });
  });
});

describe('cada chave nova é recusada em formatVersion 3', () => {
  /** Uma v3 que usa todas as chaves novas, uma vez cada. */
  function v3WithEverything(): Json {
    const spec = v4();
    spec.formatVersion = 3;
    spec.layers[0].annotationTypes[0].sources[0].slot = 'content';
    spec.layers[0].annotationTypes[1].fields.push({
      key: 'rows',
      type: 'table',
      columns: [
        {
          key: 'col',
          type: 'string',
          sources: [{ system: 'figma', name: 'Linha', path: 'rows' }],
        },
      ],
    });
    return spec;
  }

  it('aponta o caminho exato de cada uso', () => {
    const issues = issuesOf(v3WithEverything());
    const expected = [
      'fonts',
      'origins',
      'migrations',
      `${BUTTON}.component`,
      `${BUTTON}.doc`,
      `${BUTTON}.examples`,
      `${BUTTON}.sources[0].slot`,
      `${BUTTON}.sources[0].ignore`,
      `${BUTTON}.fields[1].sources[0].path`,
      `${BADGE}.fields[2].columns[0].sources[0].path`,
    ];
    expect(issues.map((i) => i.path).sort()).toEqual([...expected].sort());
    for (const issue of issues) expect(issue.message).toBe(VERSION_4);
  });

  it.each([
    ['fonts', (s: Json) => delete s.fonts, 'fonts'],
    ['origins', (s: Json) => delete s.origins, 'origins'],
    ['migrations', (s: Json) => delete s.migrations, 'migrations'],
    [
      'component',
      (s: Json) => delete s.layers[0].annotationTypes[0].component,
      `${BUTTON}.component`,
    ],
    ['doc', (s: Json) => delete s.layers[0].annotationTypes[0].doc, `${BUTTON}.doc`],
    [
      'examples',
      (s: Json) => delete s.layers[0].annotationTypes[0].examples,
      `${BUTTON}.examples`,
    ],
    [
      'slot',
      (s: Json) => delete s.layers[0].annotationTypes[0].sources[0].slot,
      `${BUTTON}.sources[0].slot`,
    ],
    [
      'ignore',
      (s: Json) => delete s.layers[0].annotationTypes[0].sources[0].ignore,
      `${BUTTON}.sources[0].ignore`,
    ],
    [
      'path de campo',
      (s: Json) => delete s.layers[0].annotationTypes[0].fields[1].sources[0].path,
      `${BUTTON}.fields[1].sources[0].path`,
    ],
    [
      'path de coluna',
      (s: Json) =>
        delete s.layers[0].annotationTypes[1].fields[2].columns[0].sources[0].path,
      `${BADGE}.fields[2].columns[0].sources[0].path`,
    ],
  ])('sem %s, o erro dessa chave some e só dela', (_name, remove, path) => {
    const spec = v3WithEverything();
    remove(spec);
    expect(issuesOf(spec).map((i) => i.path)).not.toContain(path);
  });

  it('a mesma especialização em v4 (sem a coluna de figma) é válida', () => {
    expect(parseSpec(v4()).ok).toBe(true);
  });

  it('uma v3 e uma v2 sem as chaves novas seguem válidas', () => {
    const spec = v4();
    for (const key of ['fonts', 'origins', 'migrations']) delete spec[key];
    const button = spec.layers[0].annotationTypes[0];
    for (const key of ['component', 'doc', 'examples']) delete button[key];
    button.sources = [{ system: 'sdui', name: 'Button' }];
    button.fields[1].sources = [{ system: 'sdui', name: 'variant' }];
    for (const formatVersion of [3, 4]) {
      spec.formatVersion = formatVersion;
      expect(parseSpec(spec).ok, `v${formatVersion}`).toBe(true);
    }
  });

  it('em v3 o name de uma origem de campo continua required', () => {
    const spec = v4();
    for (const key of ['fonts', 'origins', 'migrations']) delete spec[key];
    spec.formatVersion = 3;
    const button = spec.layers[0].annotationTypes[0];
    for (const key of ['component', 'doc', 'examples']) delete button[key];
    button.sources = [{ system: 'sdui', name: 'Button' }];
    button.fields[1].sources = [{ system: 'sdui' }];
    expectIssue(
      spec,
      `${BUTTON}.fields[1].sources[0].name`,
      'required in a system that is not in origins',
    );
  });
});

describe('sources.ts: executable', () => {
  it('isExecutableSystem lê os origins da especialização', () => {
    const spec = parsed(v4());
    expect(isExecutableSystem(spec, 'sdui')).toBe(true);
    expect(isExecutableSystem(spec, 'figma')).toBe(false);
    expect(isExecutableSystem(null, 'sdui')).toBe(false);
    const withoutOrigins = v4();
    delete withoutOrigins.origins;
    delete withoutOrigins.layers[0].annotationTypes[0].sources;
    delete withoutOrigins.layers[0].annotationTypes[0].fields[1].sources;
    expect(isExecutableSystem(parsed(withoutOrigins), 'sdui')).toBe(false);
  });

  it('findTypesBySource preenche executable e continua casando só por id e name', () => {
    const exec = parsed(v4());
    const plain = v4();
    plain.id = 'plain';
    delete plain.origins;
    plain.layers[0].annotationTypes[0].sources = [{ system: 'sdui', name: 'Button' }];
    plain.layers[0].annotationTypes[0].fields[1].sources = [
      { system: 'sdui', name: 'variant' },
    ];
    for (const key of ['examples']) delete plain.layers[0].annotationTypes[0][key];
    const matches = findTypesBySource([exec, parsed(plain)], 'sdui', { name: 'Button' });
    expect(matches.map((m) => [m.specId, m.type.id, m.by, m.executable])).toEqual([
      ['biblioteca', 'button', 'name', true],
      ['plain', 'button', 'name', false],
    ]);
    expect(matches[0]?.source.ignore).toEqual(['analytics']);
  });

  it('o path de um campo nunca casa', () => {
    const spec = parsed(v4());
    expect(findTypesBySource([spec], 'sdui', { name: 'variant' })).toEqual([]);
    expect(findTypesBySource([spec], 'sdui', { id: 'variant' })).toEqual([]);
  });
});
