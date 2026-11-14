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

// Specialization formatVersion 4 (Library stage): `fonts`, `origins`, `migrations`, and on the
// types `component`, `doc`, `examples`, `slot`/`ignore`; on the fields `path`. The `migrations`
// have their own file (specMigrations.test.ts). v1 to v3 stay as they were.

const read = (path: string): string => readFileSync(path, 'utf8');
const biblioteca = read('tests/fixtures/specs/biblioteca.json');
const jsonSchema = JSON.parse(read('docs/spec.schema.json')) as Record<string, unknown>;
const jsonValidator = z.fromJSONSchema(jsonSchema as never);

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

const BUTTON = 'layers[0].annotationTypes[0]';
const BADGE = 'layers[0].annotationTypes[1]';
const VERSION_4 = 'only allowed with formatVersion 4';
const NOT_EXECUTABLE = 'only allowed in a system declared in origins';

/** The library example (v4), for the test to change. */
function v4(): Json {
  return JSON.parse(biblioteca) as Json;
}

function issuesOf(spec: Json): SpecIssue[] {
  const result = parseSpec(spec);
  if (result.ok) throw new Error('was supposed to fail');
  return result.issues;
}

function parsed(spec: Json): Spec {
  const result = parseSpec(spec);
  if (!result.ok) throw new Error(result.errors.join('\n'));
  return result.spec;
}

/** The exact path and the exact message are among the errors. */
function expectIssue(spec: Json, path: string, message: string): void {
  expect(issuesOf(spec)).toContainEqual(expect.objectContaining({ path, message }));
}

/** The exact path is among the errors and its message starts with the text. */
function expectIssueStarting(spec: Json, path: string, start: string): void {
  const issues = issuesOf(spec);
  expect(
    issues.some((i) => i.path === path && i.message.startsWith(start)),
    JSON.stringify(issues),
  ).toBe(true);
}

describe('the library example (formatVersion 4)', () => {
  it('the accepted versions go from 1 to 16', () => {
    expect(SPEC_FORMAT_VERSIONS).toEqual([
      1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16,
    ]);
  });

  it('validates in zod and in the JSON Schema, without hidden errors or warnings', () => {
    const result = parseSpec(v4());
    expect(result.ok).toBe(true);
    expect(jsonValidator.safeParse(v4()).success).toBe(true);
  });

  it('the JSON Schema accepts a literal origins[].screen.direction ltr/rtl and rejects another value', () => {
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

  it('reads the new keys and they survive parsing', () => {
    const spec = parsed(v4());
    expect(spec.formatVersion).toBe(4);
    const button = spec.layers[0]?.annotationTypes[0];
    expect(button?.component).toBe('components/button.json');
    expect(button?.doc).toBe('docs/button.md');
    // pt-BR kept: shared fixture data asserted by tests/model/spec.test.ts (tests/fixtures/specs/biblioteca.json)
    expect(button?.examples?.map((e) => e.name)).toEqual(['Primário', 'Texto']);
    expect(button?.sources).toEqual([
      { system: 'sdui', name: 'Button', ignore: ['analytics'] },
    ]);
    expect(spec.fonts).toEqual([
      { family: 'Roboto', file: 'fonts/Roboto-Regular.ttf', weight: 400 },
    ]);
    expect(spec.origins?.[0]?.system).toBe('sdui');
    expect(spec.origins?.[0]?.examples).toEqual([
      // pt-BR kept: shared fixture data asserted by tests/model/spec.test.ts (tests/fixtures/specs/biblioteca.json)
      { name: 'Configurações', file: 'examples/settings.sdui.json' },
    ]);
    expect(spec.migrations?.[0]).toMatchObject({ from: 1, to: 2 });
  });

  it('the removed field (codeRef) is still read and ignored, without losing the new keys', () => {
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

  it('an example of values that cites the removed field is an error (the field no longer exists)', () => {
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
  ] as const)('%s with %j → %s', (path, ext, expected) => {
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

  it('is the inverse of formatSpecPath', () => {
    const keys = ['layers', 1, 'annotationTypes', 0, 'fields', 2, 'sources', 0, 'path'];
    expect(parseSpecPath(formatSpecPath(keys))).toEqual(keys);
  });
});

describe('fonts', () => {
  it('accepts family, file, integer or range weight, and style', () => {
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

  it('the same family with different weights or styles is not a repetition', () => {
    const spec = v4();
    spec.fonts = [
      { family: 'Roboto', file: 'fonts/R4.ttf', weight: 400 },
      { family: 'Roboto', file: 'fonts/R7.ttf', weight: 700 },
      { family: 'Roboto', file: 'fonts/R4i.ttf', weight: 400, style: 'italic' },
      { family: 'Roboto', file: 'fonts/Rv.ttf', weight: '100 900' },
      { family: 'Other', file: 'fonts/O.ttf', weight: 400 },
    ];
    expect(parseSpec(spec).ok).toBe(true);
  });

  it('empty family', () => {
    const spec = v4();
    spec.fonts[0].family = '';
    expectIssue(spec, 'fonts[0].family', 'cannot be empty');
  });

  it.each([
    ['fonts/R.txt', 'invalid extension: expected .ttf, .otf, .woff, .woff2'],
    ['fonts/R.TTF', 'invalid extension: expected .ttf, .otf, .woff, .woff2'],
  ])('file %s', (file, message) => {
    const spec = v4();
    spec.fonts[0].file = file;
    expectIssue(spec, 'fonts[0].file', message);
  });

  it.each(['../R.ttf', '/R.ttf', 'fonts/../R.ttf', 'C:/R.ttf', ''])(
    'file %j outside the package',
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
  ])('weight %j', (weight) => {
    const spec = v4();
    spec.fonts[0].weight = weight;
    expectIssueStarting(
      spec,
      'fonts[0].weight',
      'invalid weight; use an integer from 100 to 1000',
    );
  });

  it('style other than normal and italic', () => {
    const spec = v4();
    spec.fonts[0].style = 'oblique';
    expectIssue(spec, 'fonts[0].style', 'invalid style; use "normal" or "italic"');
    expect(jsonValidator.safeParse(spec).success).toBe(false);
  });

  it('repeated family + weight + style pair', () => {
    const spec = v4();
    spec.fonts.push({ family: 'Roboto', file: 'fonts/Other.ttf', weight: 400 });
    expectIssue(spec, 'fonts[1]', 'font "Roboto" (weight 400, normal) repeated');
  });

  it('the default style counts as normal in the repetition, and without a weight it is a separate case', () => {
    const spec = v4();
    spec.fonts = [
      { family: 'Roboto', file: 'fonts/A.ttf' },
      { family: 'Roboto', file: 'fonts/B.ttf', style: 'normal' },
    ];
    expectIssue(spec, 'fonts[1]', 'font "Roboto" (no weight, normal) repeated');
  });

  it('unknown key in the font', () => {
    const spec = v4();
    spec.fonts[0].extra = 1;
    expectIssue(spec, 'fonts[0]', 'Unrecognized key: "extra"');
    expect(jsonValidator.safeParse(spec).success).toBe(false);
  });
});

describe('component e doc', () => {
  it('accepts package paths', () => {
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
  ])('%s with %s leaves the package', (key, value) => {
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
  ])('%s with %s has the wrong extension', (key, value, message) => {
    const spec = v4();
    spec.layers[0].annotationTypes[0][key] = value;
    expectIssue(spec, `${BUTTON}.${key}`, message);
    expect(jsonValidator.safeParse(spec).success).toBe(false);
  });

  it('empty', () => {
    const spec = v4();
    spec.layers[0].annotationTypes[0].component = '';
    expectIssueStarting(spec, `${BUTTON}.component`, 'invalid path');
  });
});

describe('examples of the type', () => {
  /** The Badge with one field of each type for examples of values. */
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

  it('valid values of each field type, and null always', () => {
    const spec = withFields();
    spec.layers[0].annotationTypes[1].examples = [
      {
        name: 'Complete',
        values: { text: 'New', count: 3, when: '2026-02-28', size: 'm' },
      },
      {
        name: 'Empty',
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

  it('empty values {} are also an example (the type with the defaults)', () => {
    const spec = v4();
    spec.layers[0].annotationTypes[0].examples.push({ name: 'Default', values: {} });
    expect(parseSpec(spec).ok).toBe(true);
  });

  it('description is only valid as text', () => {
    const spec = v4();
    spec.layers[0].annotationTypes[0].examples[0].description = 5;
    expect(parseSpec(spec).ok).toBe(false);
    expect(jsonValidator.safeParse(spec).success).toBe(false);
  });

  it('repeated name in the type (and the same name in another type is valid)', () => {
    const spec = v4();
    // pt-BR kept: shared fixture data asserted by tests/model/spec.test.ts (tests/fixtures/specs/biblioteca.json)
    spec.layers[0].annotationTypes[1].examples = [{ name: 'Primário', values: {} }];
    expect(parseSpec(spec).ok).toBe(true);
    // pt-BR kept: shared fixture data asserted by tests/model/spec.test.ts (tests/fixtures/specs/biblioteca.json)
    spec.layers[0].annotationTypes[0].examples[1].name = 'Primário';
    // pt-BR kept: shared fixture data asserted by tests/model/spec.test.ts (tests/fixtures/specs/biblioteca.json)
    expectIssue(spec, `${BUTTON}.examples[1].name`, 'name "Primário" repeated');
  });

  it('empty name', () => {
    const spec = v4();
    spec.layers[0].annotationTypes[0].examples[0].name = '';
    expectIssue(spec, `${BUTTON}.examples[0].name`, 'cannot be empty');
  });

  it('key that is not a field of the type (a column does not count)', () => {
    const spec = withFields();
    spec.layers[0].annotationTypes[1].examples = [
      { name: 'A', values: { nothing: 'x', col: 'y' } },
    ];
    expectIssue(
      spec,
      `${BADGE}.examples[0].values.nothing`,
      '"nothing" is not a field of the type',
    );
    expectIssue(
      spec,
      `${BADGE}.examples[0].values.col`,
      '"col" is not a field of the type',
    );
  });

  it.each([
    ['text', 5, 'must be text'],
    ['count', 'three', 'the value must be a number'],
    ['when', '2026-02-30', 'must be a valid date YYYY-MM-DD'],
    ['when', 'yesterday', 'must be a valid date YYYY-MM-DD'],
    ['when', 20260228, 'must be a valid date YYYY-MM-DD'],
    ['size', 'g', 'must be one of the options'],
    ['size', 1, 'must be one of the options'],
  ])('incompatible value in %s: %j', (key, value, message) => {
    const spec = withFields();
    spec.layers[0].annotationTypes[1].examples = [
      { name: 'A', values: { [key]: value } },
    ];
    expectIssue(spec, `${BADGE}.examples[0].values.${key}`, message);
  });

  it('value that is not text, a number or null', () => {
    const spec = withFields();
    spec.layers[0].annotationTypes[1].examples = [{ name: 'A', values: { text: true } }];
    expectIssue(
      spec,
      `${BADGE}.examples[0].values.text`,
      'must be text, a number or null (or a list of rows, in a table field)',
    );
    expect(jsonValidator.safeParse(spec).success).toBe(false);
  });

  it('a ref field takes no value in an example, not even text', () => {
    const spec = withFields();
    spec.layers[0].annotationTypes[1].examples = [{ name: 'A', values: { link: 'x' } }];
    expectIssue(
      spec,
      `${BADGE}.examples[0].values.link`,
      'a "ref" field takes no value in an example',
    );
  });

  describe('table field: the list of rows (decision 24 of #897)', () => {
    const ROWS = `${BADGE}.examples[0].values.rows`;
    const withRows = (rows: unknown, mutate?: (spec: Json) => void): Json => {
      const spec = withFields();
      mutate?.(spec);
      spec.layers[0].annotationTypes[1].examples = [{ name: 'A', values: { rows } }];
      return spec;
    };

    it('two valid rows (text, number, enum, date and null) pass', () => {
      const spec = withRows([
        { col: 'Start', num: 3, kind: 'a', day: '2026-02-28' },
        { col: null, num: null, kind: null, day: null },
        {},
      ]);
      expect(parseSpec(spec).ok).toBe(true);
      expect(jsonValidator.safeParse(spec).success).toBe(true);
    });

    it('the empty list is valid', () => {
      const spec = withRows([]);
      expect(parseSpec(spec).ok).toBe(true);
      expect(jsonValidator.safeParse(spec).success).toBe(true);
    });

    it('the formatVersion did not change', () => {
      const spec = withRows([{ col: 'x' }]);
      expect(spec.formatVersion).toBe(4);
      expect(parsed(spec).formatVersion).toBe(4);
    });

    it.each([
      ['num', 'abc', 'the value must be a number'],
      ['kind', 'z', 'must be one of the options'],
      ['day', '2026-02-30', 'must be a valid date YYYY-MM-DD'],
      ['col', 5, 'must be text'],
    ])('cell outside the column type %s: %j', (column, value, message) => {
      const spec = withRows([{ col: 'ok' }, { [column]: value }]);
      expectIssue(spec, `${ROWS}[1].${column}`, message);
    });

    it('key that is not a column, including _id', () => {
      const spec = withRows([{ col: 'ok' }, { nothing: 'x', _id: 'r1' }]);
      expectIssue(spec, `${ROWS}[1].nothing`, '"nothing" is not a column of "rows"');
      expectIssue(spec, `${ROWS}[1]._id`, '"_id" is not a column of "rows"');
    });

    it('row that is not an object', () => {
      for (const row of ['x', 3, null, ['a']]) {
        expectIssue(withRows([row]), `${ROWS}[0]`, 'must be an object (column → value)');
      }
    });

    it('a ref column only accepts null in the example (formatVersion 7 or more)', () => {
      const addRef = (spec: Json) => {
        spec.formatVersion = 7;
        spec.layers[0].annotationTypes[1].fields
          .find((f: Json) => f.key === 'rows')
          .columns.push({ key: 'to', type: 'ref', accepts: { free: true } });
      };
      expect(parseSpec(withRows([{ to: null }], addRef)).ok).toBe(true);
      expectIssue(
        withRows([{ col: 'a' }, { to: 'target' }], addRef),
        `${ROWS}[1].to`,
        'a "ref" column takes no value in an example',
      );
    });

    it.each([['x'], [5]])('text or number in the table field: %j', (value) => {
      expectIssue(withRows(value), ROWS, 'a "table" field takes only the list of rows');
    });

    it('null in the table field is valid', () => {
      expect(parseSpec(withRows(null)).ok).toBe(true);
    });

    it('a list of rows in a field that is not a table is not valid', () => {
      const spec = withFields();
      spec.layers[0].annotationTypes[1].examples = [
        { name: 'A', values: { text: [{ col: 'x' }] } },
      ];
      expect(parseSpec(spec).ok).toBe(false);
    });

    it('the JSON Schema rejects a composite cell and a list in a non-table field only by the format', () => {
      const spec = withRows([{ col: { a: 1 } }]);
      expect(jsonValidator.safeParse(spec).success).toBe(false);
      expect(parseSpec(spec).ok).toBe(false);
    });

    it('the new messages carry a code and params in the model', () => {
      const issues = issuesOf(withRows([{ nothing: 1 }, 'x']));
      expect(issues).toContainEqual({
        path: `${ROWS}[0].nothing`,
        message: '"nothing" is not a column of "rows"',
        code: 'spec.exampleNotColumn',
        params: { key: 'nothing', field: 'rows' },
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

  describe('example of an external system (system + file)', () => {
    it('accepts a system declared in origins and a .json file of the package', () => {
      const spec = v4();
      spec.layers[0].annotationTypes[0].examples.push({
        name: 'From the server',
        description: 'The node as the BFF returns it.',
        system: 'sdui',
        file: 'examples/button.sdui.json',
      });
      expect(parseSpec(spec).ok).toBe(true);
      expect(jsonValidator.safeParse(spec).success).toBe(true);
    });

    it('system outside origins', () => {
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

    it('without origins no system is declared', () => {
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

    it('file that is not a .json of the package', () => {
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

    it('system without file and file without system', () => {
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

  describe('the two modes', () => {
    it('together is an error, with the path of the example', () => {
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

    it('values together with only system is also an error', () => {
      const spec = v4();
      spec.layers[0].annotationTypes[0].examples[0].system = 'sdui';
      expectIssue(
        spec,
        `${BUTTON}.examples[0]`,
        'use "values" or "system" with "file", not both modes together',
      );
    });

    it('neither of the two is an error', () => {
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

describe('sources of the type: slot and ignore', () => {
  it('accepted in a system declared in origins', () => {
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

  it('in a system that is not in origins they are rejected, each at its own path', () => {
    const spec = v4();
    spec.layers[0].annotationTypes[1].sources = [
      { system: 'figma', name: 'Badge', slot: 'content', ignore: ['a'] },
    ];
    expectIssue(spec, `${BADGE}.sources[0].slot`, NOT_EXECUTABLE);
    expectIssue(spec, `${BADGE}.sources[0].ignore`, NOT_EXECUTABLE);
  });

  it('a system outside origins without slot or ignore stays as in v3', () => {
    const spec = v4();
    spec.layers[0].annotationTypes[1].sources = [{ system: 'figma', name: 'Badge' }];
    expect(parseSpec(spec).ok).toBe(true);
  });

  it('empty slot and ignore with empty text', () => {
    const spec = v4();
    spec.layers[0].annotationTypes[0].sources[0].slot = '';
    spec.layers[0].annotationTypes[0].sources[0].ignore = ['a', ''];
    expectIssue(spec, `${BUTTON}.sources[0].slot`, 'cannot be empty');
    expectIssue(spec, `${BUTTON}.sources[0].ignore[1]`, 'cannot be empty');
    expect(jsonValidator.safeParse(spec).success).toBe(false);
  });

  it('ignore with repetition', () => {
    const spec = v4();
    spec.layers[0].annotationTypes[0].sources[0].ignore = ['analytics', 'x', 'analytics'];
    expectIssue(spec, `${BUTTON}.sources[0].ignore[2]`, '"analytics" repeated');
    expect(jsonValidator.safeParse(spec).success).toBe(false);
  });

  it('an unknown key is still an error', () => {
    const spec = v4();
    spec.layers[0].annotationTypes[0].sources[0].extra = 1;
    expectIssue(spec, `${BUTTON}.sources[0]`, 'Unrecognized key: "extra"');
  });
});

describe('sources of field and column: path and name', () => {
  const STYLE = `${BUTTON}.fields[1].sources[0]`;

  /** The Badge with a table whose column has `sources`. */
  function withColumn(source: Json): Json {
    const spec = v4();
    spec.layers[0].annotationTypes[1].fields.push({
      key: 'rows',
      type: 'table',
      columns: [{ key: 'col', type: 'string', sources: [source] }],
    });
    return spec;
  }

  it('in an executable system the path is enough and the name is optional', () => {
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
    'path with valid syntax: %s',
    (path) => {
      const spec = v4();
      spec.layers[0].annotationTypes[0].fields[1].sources[0].path = path;
      expect(parseSpec(spec).ok).toBe(true);
    },
  );

  it('in an executable system the path is required, even with name', () => {
    const spec = v4();
    delete spec.layers[0].annotationTypes[0].fields[1].sources[0].path;
    expectIssue(spec, `${STYLE}.path`, 'required in a system declared in origins');
    expect(jsonValidator.safeParse(spec).success).toBe(true);
  });

  it('in a system outside origins the name is still required and the path is forbidden', () => {
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

  it('table column: executable asks for path, outside origins asks for name', () => {
    expect(parseSpec(withColumn({ system: 'sdui', path: 'rows[0]' })).ok).toBe(true);
    expect(parseSpec(withColumn({ system: 'figma', name: 'Row' })).ok).toBe(true);
    const column = `${BADGE}.fields[2].columns[0].sources[0]`;
    expectIssue(
      withColumn({ system: 'sdui', name: 'Row' }),
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

  it('the existing values checks still apply with path', () => {
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
  it('parsing returns the origins as parseOrigins understands them', () => {
    const origin = parsed(v4()).origins?.[0];
    expect(origin).toMatchObject({
      system: 'sdui',
      name: 'SDUI',
      node: { type: 'type', props: 'props', children: 'children' },
    });
    expect(origin?.screen?.roots).toEqual([{ path: 'content' }]);
  });

  it('a parseOrigins problem arrives as a zod issue at the exact path', () => {
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
      'without the node',
      (o: Json) => delete o.node,
      'origins[0].node',
      'expected an object with type, props and children',
    ],
    ['without the screen', (o: Json) => delete o.screen, 'origins[0].screen', 'required'],
    [
      'without the width',
      (o: Json) => delete o.screen.width,
      'origins[0].screen.width',
      'required',
    ],
    ['unknown key', (o: Json) => (o.extra = 1), 'origins[0].extra', 'unknown key: extra'],
    [
      '[*] outside roots',
      (o: Json) => (o.screen.width = { path: 'a[*]' }),
      'origins[0].screen.width.path',
      '"[*]" is only valid in roots[].path',
    ],
  ])('%s', (_name, mutate, path, message) => {
    const spec = v4();
    mutate(spec.origins[0]);
    expectIssue(spec, path, message);
  });

  it('origins with the same system', () => {
    const spec = v4();
    spec.origins.push(structuredClone(spec.origins[0]));
    expectIssue(spec, 'origins[1].system', 'repeated origin: sdui');
  });

  it('origins that is not a list', () => {
    const spec = v4();
    spec.origins = { system: 'sdui' };
    expectIssue(spec, 'origins', 'expected a list');
  });

  it('empty origins is valid (no executable system)', () => {
    const spec = v4();
    spec.origins = [];
    spec.layers[0].annotationTypes[0].sources = [{ system: 'sdui', name: 'Button' }];
    spec.layers[0].annotationTypes[0].fields[1].sources[0] = {
      system: 'sdui',
      name: 'x',
    };
    expect(parseSpec(spec).ok).toBe(true);
  });

  it('an origin with a problem still counts as declared: no cascading errors', () => {
    const spec = v4();
    delete spec.origins[0].node;
    const issues = issuesOf(spec);
    expect(issues.map((i) => i.path)).toEqual(['origins[0].node']);
  });

  describe('examples of the origin', () => {
    it('accepts a unique name and a .json file of the package', () => {
      const spec = v4();
      spec.origins[0].examples.push({ name: 'Other', file: 'examples/other.json' });
      expect(parsed(spec).origins?.[0]?.examples).toHaveLength(2);
    });

    it('repeated name', () => {
      const spec = v4();
      // pt-BR kept: shared fixture data asserted by tests/model/spec.test.ts (tests/fixtures/specs/biblioteca.json)
      spec.origins[0].examples.push({ name: 'Configurações', file: 'examples/b.json' });
      expectIssue(spec, 'origins[0].examples[1].name', 'name "Configurações" repeated');
    });

    it('empty name', () => {
      const spec = v4();
      spec.origins[0].examples[0].name = '';
      expectIssue(spec, 'origins[0].examples[0].name', 'expected non-empty text');
    });

    it.each([
      ['examples/a.md', 'invalid extension: expected .json'],
      ['../a.json', 'invalid path: use a path relative'],
      ['/a.json', 'invalid path: use a path relative'],
    ])('file %s', (file, start) => {
      const spec = v4();
      spec.origins[0].examples[0].file = file;
      expectIssueStarting(spec, 'origins[0].examples[0].file', start);
    });

    it('missing file, unknown key and invalid list', () => {
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

describe('each new key is rejected in formatVersion 3', () => {
  /** A v3 that uses all the new keys, once each. */
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
          sources: [{ system: 'figma', name: 'Row', path: 'rows' }],
        },
      ],
    });
    return spec;
  }

  it('points at the exact path of each use', () => {
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
      'field path',
      (s: Json) => delete s.layers[0].annotationTypes[0].fields[1].sources[0].path,
      `${BUTTON}.fields[1].sources[0].path`,
    ],
    [
      'column path',
      (s: Json) =>
        delete s.layers[0].annotationTypes[1].fields[2].columns[0].sources[0].path,
      `${BADGE}.fields[2].columns[0].sources[0].path`,
    ],
  ])(
    'without %s, the error of that key disappears and only of it',
    (_name, remove, path) => {
      const spec = v3WithEverything();
      remove(spec);
      expect(issuesOf(spec).map((i) => i.path)).not.toContain(path);
    },
  );

  it('the same specialization in v4 (without the figma column) is valid', () => {
    expect(parseSpec(v4()).ok).toBe(true);
  });

  it('a v3 and a v2 without the new keys are still valid', () => {
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

  it('in v3 the name of a field origin is still required', () => {
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
  it('isExecutableSystem reads the origins of the specialization', () => {
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

  it('findTypesBySource fills executable and still matches only by id and name', () => {
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

  it('the path of a field never matches', () => {
    const spec = parsed(v4());
    expect(findTypesBySource([spec], 'sdui', { name: 'variant' })).toEqual([]);
    expect(findTypesBySource([spec], 'sdui', { id: 'variant' })).toEqual([]);
  });
});
